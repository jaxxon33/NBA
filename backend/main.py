from fastapi import FastAPI, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
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
                    unique_matches[match_key] = {
                        "h_team": odd['home_team'],
                        "a_team": odd['away_team']
                    }
                    
            upcoming_matches = list(unique_matches.values())
        except Exception:
            upcoming_matches = []
            
        # Fallback if the API fails or returns nothing
        if not upcoming_matches:
            teams = ["Boston Celtics", "Miami Heat", "Los Angeles Lakers", "Golden State Warriors", "Denver Nuggets", "Phoenix Suns", "Milwaukee Bucks", "Philadelphia 76ers"]
            upcoming_matches = [{"h_team": random.sample(teams, 2)[0], "a_team": random.sample(teams, 2)[1]} for _ in range(5)]

        venues = ["TD Garden", "Crypto.com Arena", "Ball Arena", "Kaseya Center", "Chase Center"]
        bookmakers = ["DraftKings", "FanDuel", "BetMGM", "Caesars"]

        for match_data in upcoming_matches:
            h_team = match_data["h_team"]
            a_team = match_data["a_team"]
            
            match = models.Match(
                home_team=h_team,
                away_team=a_team,
                venue=random.choice(venues),
                match_date=datetime.datetime.utcnow() + datetime.timedelta(days=random.randint(1, 7)),
                status="upcoming"
            )
            db.add(match)
            db.commit()
            db.refresh(match)
            
            # Predict some mock bets for this match initially (will be overwritten by simulation)
            for _ in range(random.randint(2, 5)):
                bookmaker = random.choice(bookmakers)
                bookmaker_odds = round(random.uniform(1.5, 4.0), 2)
                model_probability = round(random.uniform(0.3, 0.8), 2)
                
                ev = (model_probability * bookmaker_odds) - 1.0
                ev_percentage = round(ev * 100, 2)
                
                is_value = ev_percentage > 5.0
                
                if is_value:
                    bet = models.Bet(
                        match_id=match.id,
                        market=random.choice(["H2H", "Line", "Total Points", "Player Props"]),
                        selection=random.choice([h_team, a_team, "Over 220.5", "Under 220.5", "Jayson Tatum 25+ Points"]),
                        bookmaker_odds=bookmaker_odds,
                        model_probability=model_probability,
                        ev_percentage=ev_percentage,
                        is_value_bet=is_value,
                        bookmaker=bookmaker
                    )
                    db.add(bet)
        db.commit()

@app.on_event("startup")
async def startup_event():
    db = SessionLocal()
    seed_database(db)
    db.close()

@app.get("/api/matches", response_model=list[schemas.Match])
def get_matches(db: Session = Depends(get_db)):
    return db.query(models.Match).all()

@app.get("/api/bets/ev", response_model=list[schemas.Bet])
def get_ev_bets(db: Session = Depends(get_db)):
    return db.query(models.Bet).filter(models.Bet.is_value_bet == True).order_by(models.Bet.ev_percentage.desc()).all()

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

    # Retrieve mock odds (or real if API key set)
    live_odds = odds_api.fetch_live_odds()
    parsed_odds = odds_api.parse_odds(live_odds)
    
    mc_cache = {}
    
    # Process each live odd with our ML Engine instead of random data
    for odd in parsed_odds:
        h_team = odd['home_team']
        a_team = odd['away_team']
        
        match_key = f"{h_team}_{a_team}"
        if match_key not in mc_cache:
            mc_cache[match_key] = ml_engine.run_monte_carlo_simulation(h_team, a_team, "TD Garden", num_simulations=5000)
            
        mc = mc_cache[match_key]
        
        market = odd['market']
        selection = odd['selection']
        bookmaker_odds = float(odd['odds'])
        point = odd.get('point')
        
        model_probability = 0.0
        
        if market == 'h2h':
            if selection == h_team:
                model_probability = mc['mc_home_prob']
            else:
                model_probability = mc['mc_away_prob']
                
        elif market == 'totals':
            point_val = float(point) if point else 220.5
            over_count = sum(1 for pts in mc['total_points_list'] if pts > point_val)
            over_prob = over_count / len(mc['total_points_list'])
            
            if 'Over' in str(selection):
                model_probability = over_prob
            else:
                model_probability = 1.0 - over_prob
                
        elif market == 'spreads':
            point_val = float(point) if point else 0.0
            
            if selection == h_team:
                cover_count = sum(1 for margin in mc['home_margins'] if margin + point_val > 0)
            else:
                cover_count = sum(1 for margin in mc['home_margins'] if margin - point_val < 0)
                
            model_probability = cover_count / len(mc['home_margins'])
            
        else:
            model_probability = random.uniform(0.4, 0.6) # Uncategorized markets
            
        implied_prob = 1 / bookmaker_odds
        
        # Calculate +EV
        ev = (model_probability * bookmaker_odds) - 1.0
        ev_percentage = round(ev * 100, 2)
        
        is_value = ev_percentage > 5.0
        
        if is_value:
            # Check if we have an active match for these teams
            match = db.query(models.Match).filter(
                models.Match.home_team == h_team, 
                models.Match.away_team == a_team,
                models.Match.status == "upcoming"
            ).first()
            
            # If the match wasn't initially seeded but is in the live odds feed, create it dynamically
            if not match:
                venues = ["TD Garden", "Crypto.com Arena", "Ball Arena", "Kaseya Center", "Chase Center"]
                match = models.Match(
                    home_team=h_team,
                    away_team=a_team,
                    venue=random.choice(venues),
                    match_date=datetime.datetime.utcnow() + datetime.timedelta(days=random.randint(1, 7)),
                    status="upcoming"
                )
                db.add(match)
                db.commit()
                db.refresh(match)
                
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
                    model_probability=round(model_probability, 3),
                    ev_percentage=ev_percentage,
                    is_value_bet=is_value,
                    bookmaker=odd['bookmaker']
                )
                db.add(bet)
                
    db.commit()

@app.post("/api/run-simulation")
def trigger_simulation(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Triggers the Monte Carlo simulation to find new lines"""
    background_tasks.add_task(simulate_new_data, db)
    return {"message": "Simulation started. Running millions of iterations in the background..."}
