from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from collections import defaultdict
import models
import schemas
from database import engine, SessionLocal
import datetime
import random
import ml_engine
import odds_api

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="NBA +EV Betting Model V2")

# Configure CORS
origins = [
    "http://localhost:5173", # Vite default
    "http://127.0.0.1:5173",
    "*" # For ease in testing
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Lowered to 1.0% — sharp-consensus methodology surfaces real but small edges;
# 5%+ doesn't exist in efficient NBA markets except as model artifacts.
EV_THRESHOLD_PERCENT = 1.0

# Books considered "sharp" — low margin, high liquidity, reflect informed money.
# Used to compute the reference probability that other books are scored against.
SHARP_BOOKS = {
    "Betfair",        # Exchange — peer-to-peer, ~0.5% vig
    "Pinnacle",       # Sharpest traditional book (if surfaced by The Odds API)
    "LowVig.ag",      # Explicit low-vig offshore book
    "BetOnline.ag",   # Sharp offshore book
    "Circa Sports",   # Sharp Vegas operator
}

# Real NBA home venues — replaces the previous random venue picker.
TEAM_VENUES = {
    "Atlanta Hawks": "State Farm Arena",
    "Boston Celtics": "TD Garden",
    "Brooklyn Nets": "Barclays Center",
    "Charlotte Hornets": "Spectrum Center",
    "Chicago Bulls": "United Center",
    "Cleveland Cavaliers": "Rocket Mortgage FieldHouse",
    "Dallas Mavericks": "American Airlines Center",
    "Denver Nuggets": "Ball Arena",
    "Detroit Pistons": "Little Caesars Arena",
    "Golden State Warriors": "Chase Center",
    "Houston Rockets": "Toyota Center",
    "Indiana Pacers": "Gainbridge Fieldhouse",
    "LA Clippers": "Intuit Dome",
    "Los Angeles Clippers": "Intuit Dome",
    "Los Angeles Lakers": "Crypto.com Arena",
    "Memphis Grizzlies": "FedExForum",
    "Miami Heat": "Kaseya Center",
    "Milwaukee Bucks": "Fiserv Forum",
    "Minnesota Timberwolves": "Target Center",
    "New Orleans Pelicans": "Smoothie King Center",
    "New York Knicks": "Madison Square Garden",
    "Oklahoma City Thunder": "Paycom Center",
    "Orlando Magic": "Kia Center",
    "Philadelphia 76ers": "Wells Fargo Center",
    "Phoenix Suns": "PHX Arena",
    "Portland Trail Blazers": "Moda Center",
    "Sacramento Kings": "Golden 1 Center",
    "San Antonio Spurs": "Frost Bank Center",
    "Toronto Raptors": "Scotiabank Arena",
    "Utah Jazz": "Delta Center",
    "Washington Wizards": "Capital One Arena",
}

# NBA-specific half-point probability conversions, approximated from
# published margin-of-victory distributions. Used to value better lines on
# spreads/totals when comparing books offering different points.
SPREAD_HALF_POINT_VALUE = {
    # spread magnitude -> probability gained per +0.5 to the underdog side
    1.0: 0.030, 1.5: 0.025, 2.0: 0.022, 2.5: 0.020, 3.0: 0.045,  # 3 is key
    3.5: 0.025, 4.0: 0.020, 4.5: 0.020, 5.0: 0.020, 5.5: 0.020,
    6.0: 0.022, 6.5: 0.045, 7.0: 0.045, 7.5: 0.025, 8.0: 0.018,  # 7 is key
    8.5: 0.018, 9.0: 0.022, 9.5: 0.020, 10.0: 0.025, 10.5: 0.018,
    11.0: 0.015, 11.5: 0.012, 12.0: 0.012,
}

def parse_commence_time(value):
    if not value:
        return None

    try:
        return datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    except Exception:
        return None

def decimal_odds(value):
    try:
        odds = float(value)
    except (TypeError, ValueError):
        return None

    if odds <= 1.0:
        return None
    return odds

def calculate_ev_percentage(model_probability, bookmaker_odds):
    try:
        probability = float(model_probability)
        odds = float(bookmaker_odds)
    except (TypeError, ValueError):
        return None

    if probability < 0.0 or probability > 1.0 or odds <= 1.0:
        return None

    return round(((probability * odds) - 1.0) * 100, 2)

def kelly_fraction(probability, odds, multiplier=1.0):
    """Fraction of bankroll the Kelly criterion recommends staking. Returns 0
    for non-positive edge so it never recommends bets without value."""
    try:
        p = float(probability)
        b = float(odds) - 1.0
    except (TypeError, ValueError):
        return 0.0
    if b <= 0 or p <= 0 or p >= 1:
        return 0.0
    q = 1 - p
    frac = (b * p - q) / b
    if frac <= 0:
        return 0.0
    return round(frac * multiplier, 4)

def line_bucket(market, point):
    if point is None:
        return None

    try:
        value = float(point)
    except (TypeError, ValueError):
        return str(point)

    if market == 'spreads':
        value = abs(value)

    return round(value, 2)

def point_identity(point):
    if point is None:
        return None

    try:
        return round(float(point), 2)
    except (TypeError, ValueError):
        return str(point)

def bookmaker_market_key(odd):
    market = odd.get('market')
    return (
        odd.get('home_team'),
        odd.get('away_team'),
        odd.get('bookmaker'),
        market,
        line_bucket(market, odd.get('point'))
    )

def outcome_key(odd):
    return (
        odd.get('home_team'),
        odd.get('away_team'),
        odd.get('market'),
        odd.get('selection'),
        point_identity(odd.get('point'))
    )

def devigged_probabilities(parsed_odds):
    """Per (game, book, market, line) group, devig the outcomes proportionally.
    Returns list of (odd, devigged_probability) tuples grouped by outcome_key."""
    by_book_market = defaultdict(list)
    for odd in parsed_odds:
        odds = decimal_odds(odd.get('odds'))
        if odds is None:
            continue
        by_book_market[bookmaker_market_key(odd)].append((odd, 1 / odds))

    out = defaultdict(list)
    for outcomes in by_book_market.values():
        if len(outcomes) < 2:
            continue
        raw_total = sum(raw for _, raw in outcomes)
        if raw_total <= 0:
            continue
        for odd, raw in outcomes:
            out[outcome_key(odd)].append((odd.get('bookmaker'), raw / raw_total))
    return out

def get_sharp_probability(odd, sharp_devigged, fallback_devigged):
    """Return the sharp-book consensus probability for this outcome. Falls back
    to all-book consensus when no sharp books quote this market."""
    key = outcome_key(odd)
    sharp = sharp_devigged.get(key, [])
    # Exclude the book being evaluated to avoid self-referential EV.
    own = odd.get('bookmaker')
    other_sharp = [p for bm, p in sharp if bm != own]
    if other_sharp:
        return sum(other_sharp) / len(other_sharp), "sharp_consensus"

    # No sharp book quote — use the broader consensus minus the own book.
    all_probs = fallback_devigged.get(key, [])
    other = [p for bm, p in all_probs if bm != own]
    if other:
        return sum(other) / len(other), "market_consensus"
    return None, None

def best_line_adjusted_probability(odd, sharp_devigged, fallback_devigged):
    """For spreads/totals, when the offered line differs from sharp-book lines,
    adjust the sharp probability by the value of the line difference."""
    market = odd.get('market')
    if market not in ('spreads', 'totals'):
        return None, None
    own_point = point_identity(odd.get('point'))
    if own_point is None:
        return None, None

    # Gather sharp probabilities for the same selection at any line.
    own = odd.get('bookmaker')
    matching_lines = []
    for key, probs in sharp_devigged.items():
        h, a, mkt, sel, pt = key
        if (h == odd.get('home_team') and a == odd.get('away_team')
                and mkt == market and sel == odd.get('selection') and pt is not None):
            for bm, p in probs:
                if bm != own:
                    matching_lines.append((pt, p))

    if not matching_lines:
        return None, None

    # Pick the closest line to the offered one.
    closest_line, closest_prob = min(matching_lines, key=lambda x: abs(x[0] - own_point))
    line_diff = own_point - closest_line

    if abs(line_diff) < 0.01:
        return closest_prob, "sharp_consensus"

    if market == 'spreads':
        # For spreads, positive line_diff for the underdog side increases win prob.
        # Selection name is a team; check spread sign to determine direction.
        try:
            offered = float(odd.get('point'))
        except (TypeError, ValueError):
            return closest_prob, "sharp_consensus"
        # Probability gain per 0.5 points moved toward the side being bet.
        steps = abs(line_diff) / 0.5
        mag_avg = (abs(own_point) + abs(closest_line)) / 2
        bucket = round(mag_avg * 2) / 2  # nearest 0.5
        per_half = SPREAD_HALF_POINT_VALUE.get(bucket, 0.020)
        # If offered point is more favorable (more points) than the reference,
        # probability goes up. We assume "more points for the named team" means
        # the team is getting better odds — line_diff > 0 means more points.
        direction = 1 if line_diff > 0 else -1
        adjusted = closest_prob + (direction * steps * per_half)
    else:  # totals
        # For totals, moving the total down increases Under prob and decreases Over.
        steps = abs(line_diff) / 0.5
        per_half = 0.020  # NBA totals are ~2% per half-point on average
        selection = (odd.get('selection') or '').lower()
        if 'over' in selection:
            direction = -1 if line_diff > 0 else 1  # higher total = lower Over prob
        else:
            direction = 1 if line_diff > 0 else -1  # higher total = higher Under prob
        adjusted = closest_prob + (direction * steps * per_half)

    adjusted = max(0.01, min(0.99, adjusted))
    return adjusted, "sharp_consensus_adjusted"

def resolve_venue(home_team):
    return TEAM_VENUES.get(home_team) or "TBD"

def get_or_create_match(db, home_team, away_team, commence_time=None):
    match = db.query(models.Match).filter(
        models.Match.home_team == home_team,
        models.Match.away_team == away_team,
        models.Match.status == "upcoming"
    ).first()

    if match:
        # Backfill correct venue if a previous seed wrote a placeholder.
        correct_venue = resolve_venue(home_team)
        if match.venue != correct_venue and correct_venue != "TBD":
            match.venue = correct_venue
            db.commit()
            db.refresh(match)
        return match

    match = models.Match(
        home_team=home_team,
        away_team=away_team,
        venue=resolve_venue(home_team),
        match_date=commence_time or datetime.datetime.utcnow() + datetime.timedelta(days=1),
        status="upcoming"
    )
    db.add(match)
    db.commit()
    db.refresh(match)
    return match

# Seed Database
def seed_database(db: Session):
    if db.query(models.Match).count() == 0:
        # Retrieve active team pairings currently offered by Bookmakers
        try:
            live_odds = odds_api.fetch_live_odds()
            parsed_odds = odds_api.parse_odds(live_odds)

            # Extract unique upcoming games from the odds feed
            unique_matches = {}
            for odd in parsed_odds:
                match_key = f"{odd['home_team']} _ {odd['away_team']}"
                if match_key not in unique_matches:

                    # Try to parse the real commence time if available.
                    match_time = (
                        parse_commence_time(odd.get('commence_time')) or
                        datetime.datetime.utcnow() + datetime.timedelta(days=random.randint(1, 4))
                    )

                    unique_matches[match_key] = {
                        "h_team": odd['home_team'],
                        "a_team": odd['away_team'],
                        "commence_time": match_time
                    }

            upcoming_matches = list(unique_matches.values())
        except Exception as e:
            print("Error parsing live odds for seeder:", e)
            upcoming_matches = []

        # Fallback if the API fails or returns nothing
        if not upcoming_matches:
            teams = ["Boston Celtics", "Miami Heat", "Los Angeles Lakers", "Golden State Warriors", "Denver Nuggets", "Phoenix Suns", "Milwaukee Bucks", "Philadelphia 76ers"]
            upcoming_matches = []
            for _ in range(5):
                h_team, a_team = random.sample(teams, 2)
                upcoming_matches.append({
                    "h_team": h_team,
                    "a_team": a_team,
                    "commence_time": datetime.datetime.utcnow() + datetime.timedelta(days=1)
                })

        for match_data in upcoming_matches:
            get_or_create_match(
                db,
                match_data["h_team"],
                match_data["a_team"],
                match_data.get("commence_time")
            )

@app.on_event("startup")
async def startup_event():
    db = SessionLocal()
    try:
        seed_database(db)
        simulate_new_data(db)
    finally:
        db.close()

@app.get("/api/matches", response_model=list[schemas.Match])
def get_matches(db: Session = Depends(get_db)):
    return db.query(models.Match).all()

@app.get("/api/matches/{match_id}/odds")
def get_match_odds(match_id: int, db: Session = Depends(get_db)):
    """Return every recorded bookmaker offer for a match, plus per-outcome
    sharp consensus and best price. Powers the Matches detail view."""
    match = db.query(models.Match).filter(models.Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    bets = db.query(models.Bet).filter(models.Bet.match_id == match_id).all()

    # Step 1 — compute per-(bookmaker, market) sum of raw implied probabilities.
    # This gives each book's overround for each market (e.g. 1.054 = 5.4% margin).
    book_mkt_sum = defaultdict(float)
    for bet in bets:
        if bet.bookmaker_odds and bet.bookmaker_odds > 1:
            book_mkt_sum[(bet.bookmaker, bet.market)] += 1.0 / bet.bookmaker_odds

    # Step 2 — build per-outcome lists with transparency fields.
    by_outcome = defaultdict(list)
    for bet in bets:
        if not bet.bookmaker_odds or bet.bookmaker_odds <= 1:
            continue
        implied = round(1.0 / bet.bookmaker_odds, 4)
        overround = round(book_mkt_sum.get((bet.bookmaker, bet.market), 1.0), 4)
        # This book's own fair probability estimate after removing their margin.
        devigged = round(implied / overround, 4) if overround > 0 else implied
        by_outcome[(bet.market, bet.selection)].append({
            "bookmaker": bet.bookmaker,
            "odds": bet.bookmaker_odds,
            "ev_percentage": bet.ev_percentage,
            "is_value_bet": bet.is_value_bet,
            "model_probability": bet.model_probability,
            "implied_probability": implied,
            "devigged_probability": devigged,
            "overround": overround,
            "is_sharp": bet.bookmaker in SHARP_BOOKS,
        })

    outcomes = []
    for (market, selection), books in by_outcome.items():
        best = max(books, key=lambda b: b["odds"])
        probs = sorted(b["model_probability"] for b in books if b["model_probability"] is not None)
        sharp_prob = probs[len(probs)//2] if probs else None
        outcomes.append({
            "market": market,
            "selection": selection,
            "sharp_probability": sharp_prob,
            "best_price": best["odds"],
            "best_book": best["bookmaker"],
            "books": sorted(books, key=lambda b: (-b["is_sharp"], -b["odds"])),
        })

    outcomes.sort(key=lambda o: (o["market"], o["selection"]))

    return {
        "match": {
            "id": match.id,
            "home_team": match.home_team,
            "away_team": match.away_team,
            "venue": match.venue,
            "match_date": match.match_date,
            "status": match.status,
        },
        "outcomes": outcomes,
        "sharp_books": sorted(SHARP_BOOKS),
    }

@app.get("/api/bets/ev", response_model=list[schemas.Bet])
def get_ev_bets(db: Session = Depends(get_db)):
    ev_bets = db.query(models.Bet, models.Match)\
                .join(models.Match, models.Bet.match_id == models.Match.id)\
                .filter(models.Bet.is_value_bet == True)\
                .order_by(models.Bet.ev_percentage.desc()).all()

    out = []
    for bet, match in ev_bets:
        bet_data = bet.__dict__.copy()
        bet_data["match_date"] = match.match_date
        bet_data["home_team"] = match.home_team
        bet_data["away_team"] = match.away_team
        out.append(bet_data)

    return out

@app.get("/api/stats", response_model=schemas.DashboardStats)
def get_stats(db: Session = Depends(get_db)):
    ev_bets = db.query(models.Bet).filter(models.Bet.is_value_bet == True).all()
    total_ev = len(ev_bets)
    avg_ev = sum([b.ev_percentage for b in ev_bets]) / total_ev if total_ev > 0 else 0.0
    upcoming = db.query(models.Match).filter(models.Match.status == "upcoming").count()
    return schemas.DashboardStats(
        total_ev_bets=total_ev,
        avg_ev_percentage=round(avg_ev, 2),
        total_matches_upcoming=upcoming
    )

def simulate_new_data(db: Session):
    # Clear existing bets to prevent duplicates
    db.query(models.Bet).delete()
    db.commit()

    live_odds = odds_api.fetch_live_odds()
    parsed_odds = odds_api.parse_odds(live_odds)
    if not parsed_odds:
        return

    # Strip lay markets — lay-price probabilities aren't directly comparable
    # to back-price EV and contaminate consensus calculations.
    back_odds = [o for o in parsed_odds if 'lay' not in o.get('market', '')]

    # Devigged probabilities split two ways: from sharp books only, and from
    # all books as a fallback when no sharp book quotes a particular outcome.
    sharp_odds = [o for o in back_odds if o.get('bookmaker') in SHARP_BOOKS]
    sharp_devigged = devigged_probabilities(sharp_odds)
    all_devigged = devigged_probabilities(back_odds)

    persisted = 0
    for odd in back_odds:
        bookmaker_odds = decimal_odds(odd.get('odds'))
        if bookmaker_odds is None:
            continue

        # Try direct sharp consensus first (same line).
        model_probability, source = get_sharp_probability(odd, sharp_devigged, all_devigged)

        # For spreads/totals, also try cross-line value if no direct sharp price.
        if model_probability is None or source == "market_consensus":
            adjusted, adj_source = best_line_adjusted_probability(odd, sharp_devigged, all_devigged)
            if adjusted is not None and (model_probability is None or adj_source.startswith("sharp")):
                model_probability = adjusted
                source = adj_source

        if model_probability is None:
            continue

        ev_percentage = calculate_ev_percentage(model_probability, bookmaker_odds)
        if ev_percentage is None:
            continue

        is_value = ev_percentage > EV_THRESHOLD_PERCENT
        match = get_or_create_match(
            db,
            odd['home_team'],
            odd['away_team'],
            parse_commence_time(odd.get('commence_time'))
        )
        if not match:
            continue

        final_selection = odd['selection']
        market = odd['market']
        point = odd.get('point')
        if point is not None and market in ('totals', 'spreads'):
            if market == 'totals':
                final_selection = f"{odd['selection']} {point}"
            else:
                sign = "+" if float(point) > 0 else ""
                final_selection = f"{odd['selection']} {sign}{point}"

        bet = models.Bet(
            match_id=match.id,
            market=market,
            selection=final_selection,
            bookmaker_odds=bookmaker_odds,
            model_probability=round(float(model_probability), 4),
            ev_percentage=ev_percentage,
            is_value_bet=is_value,
            bookmaker=odd['bookmaker']
        )
        db.add(bet)
        persisted += 1

    db.commit()
    print(f"Simulation complete: {persisted} bookmaker offerings recorded.")

def simulate_new_data_task():
    db = SessionLocal()
    try:
        simulate_new_data(db)
    finally:
        db.close()

@app.post("/api/run-simulation")
def trigger_simulation(background_tasks: BackgroundTasks):
    """Refreshes odds and recomputes the sharp-consensus EV for every quote."""
    background_tasks.add_task(simulate_new_data_task)
    return {"message": "Refresh started. Pulling odds and recomputing sharp-consensus EV..."}
