from fastapi import FastAPI, Depends, BackgroundTasks
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

app = FastAPI(title="NBA +EV Betting Model")

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

EV_THRESHOLD_PERCENT = 2.5

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

def build_consensus_probabilities(parsed_odds):
    by_book_market = defaultdict(list)
    consensus = defaultdict(list)

    for odd in parsed_odds:
        odds = decimal_odds(odd.get('odds'))
        if odds is None:
            continue

        by_book_market[bookmaker_market_key(odd)].append((odd, 1 / odds))

    for outcomes in by_book_market.values():
        if len(outcomes) < 2:
            continue

        raw_total = sum(raw_probability for _, raw_probability in outcomes)
        if raw_total <= 0:
            continue

        for odd, raw_probability in outcomes:
            consensus[outcome_key(odd)].append((
                odd.get('bookmaker'),
                raw_probability / raw_total
            ))

    return consensus

def get_consensus_probability(odd, consensus):
    market_probs = consensus.get(outcome_key(odd), [])
    if not market_probs:
        return None

    other_books = [
        probability for bookmaker, probability in market_probs
        if bookmaker != odd.get('bookmaker')
    ]
    probabilities = other_books or [probability for _, probability in market_probs]

    return sum(probabilities) / len(probabilities)

def get_or_create_match(db, home_team, away_team, commence_time=None):
    match = db.query(models.Match).filter(
        models.Match.home_team == home_team,
        models.Match.away_team == away_team,
        models.Match.status == "upcoming"
    ).first()

    if match:
        return match

    venues = ["TD Garden", "Crypto.com Arena", "Ball Arena", "Kaseya Center", "Chase Center"]
    match = models.Match(
        home_team=home_team,
        away_team=away_team,
        venue=random.choice(venues),
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

    # Retrieve live odds when configured; otherwise use deterministic mock odds.
    live_odds = odds_api.fetch_live_odds()
    parsed_odds = odds_api.parse_odds(live_odds)

    if not parsed_odds:
        return

    # Exclude lay markets before building consensus — lay odds use different
    # probability semantics and pollute the devigged consensus for back bets.
    back_odds = [o for o in parsed_odds if 'lay' not in o.get('market', '')]
    consensus = build_consensus_probabilities(back_odds)
    h2h_probability_cache = {}

    for odd in back_odds:
        h_team = odd['home_team']
        a_team = odd['away_team']
        market = odd['market']
        selection = odd['selection']
        bookmaker_odds = decimal_odds(odd.get('odds'))
        point = odd.get('point')

        if bookmaker_odds is None:
            continue

        model_probability = None

        # Always use the ML model for h2h — predict_match has its own fallback
        # (deterministic hash-seeded baseline) when the trained model isn't ready.
        if market == 'h2h':
            match_key = f"{h_team}_{a_team}"
            if match_key not in h2h_probability_cache:
                h2h_probability_cache[match_key] = ml_engine.predict_match(h_team, a_team, "Home Court")

            probabilities = h2h_probability_cache[match_key]
            if selection == h_team:
                model_probability = probabilities['home_prob']
            else:
                model_probability = probabilities['away_prob']

        if model_probability is None:
            model_probability = get_consensus_probability(odd, consensus)

        ev_percentage = calculate_ev_percentage(model_probability, bookmaker_odds)
        if ev_percentage is None:
            continue

        is_value = ev_percentage > EV_THRESHOLD_PERCENT
        
        if is_value:
            match = get_or_create_match(
                db,
                h_team,
                a_team,
                parse_commence_time(odd.get('commence_time'))
            )

            if match:
                final_selection = selection
                if point and market in ['totals', 'spreads']:
                    if market == 'totals':
                        final_selection = f"{selection} {point}"
                    elif market == 'spreads':
                        sign = "+" if float(point) > 0 else ""
                        final_selection = f"{selection} {sign}{point}"

                bet = models.Bet(
                    match_id=match.id,
                    market=market,
                    selection=final_selection,
                    bookmaker_odds=bookmaker_odds,
                    model_probability=round(float(model_probability), 3),
                    ev_percentage=ev_percentage,
                    is_value_bet=is_value,
                    bookmaker=odd['bookmaker']
                )
                db.add(bet)
                
    db.commit()

def simulate_new_data_task():
    db = SessionLocal()
    try:
        simulate_new_data(db)
    finally:
        db.close()

@app.post("/api/run-simulation")
def trigger_simulation(background_tasks: BackgroundTasks):
    """Triggers the Monte Carlo simulation to find new lines"""
    background_tasks.add_task(simulate_new_data_task)
    return {"message": "Simulation started. Refreshing odds and value calculations in the background..."}
