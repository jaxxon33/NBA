import requests
import json
import os
import random

# Theoretical The-Odds-API (Example integration)
# https://the-odds-api.com/
ODDS_API_KEY = os.getenv("ODDS_API_KEY", "eef026b080447d850bf986dd507f8024")
ODDS_URL = "https://api.the-odds-api.com/v4/sports/basketball_nba/odds"

def fetch_live_odds():
    """
    Fetches real-time odds from multiple Australian bookmakers.
    Uses The Odds API or any other live feed.
    """
    
    params = {
        'apiKey': ODDS_API_KEY,
        'regions': 'au',
        'markets': 'h2h,spreads,totals',
        'oddsFormat': 'decimal'
    }
    
    try:
        response = requests.get(ODDS_URL, params=params)
        
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 401:
            print("API Key invalid or missing. Using fallback mocked odds builder.")
            return generate_mock_odds()
        else:
            print(f"Error fetching odds: {response.status_code}")
            return []
    except Exception as e:
        print(f"Connection error to Odds API: {e}")
        return generate_mock_odds()

def parse_odds(odds_data):
    """
    Standardize the incoming JSON into our Database models
    """
    standardized = []
    
    for game in odds_data:
        home_team = game.get('home_team')
        away_team = game.get('away_team')
        
        for bookmaker in game.get('bookmakers', []):
            bookie_title = bookmaker.get('title') # "TAB", "Sportsbet", etc.
            
            for market in bookmaker.get('markets', []):
                market_key = market.get('key') # "h2h", "spreads"
                
                for outcome in market.get('outcomes', []):
                    name = outcome.get('name')
                    price = outcome.get('price')
                    point = outcome.get('point', None)
                    
                    # Example parsed object
                    standardized.append({
                        "home_team": home_team,
                        "away_team": away_team,
                        "commence_time": game.get('commence_time'), 
                        "bookmaker": bookie_title,
                        "market": market_key,
                        "selection": name,
                        "odds": price,
                        "point": point
                    })
                    
    return standardized

def generate_mock_odds():
    """Fallback generator if no active API key for testing"""
    print("Generating simulated live odds...")
    bookies = ["DraftKings", "FanDuel", "BetMGM", "Caesars"]
    teams = [
        ("Boston Celtics", "Miami Heat"),
        ("Los Angeles Lakers", "Golden State Warriors"),
        ("Denver Nuggets", "Phoenix Suns"),
        ("Milwaukee Bucks", "Philadelphia 76ers")
    ]
    import datetime
    
    mock_data = []
    base_time = datetime.datetime.utcnow() + datetime.timedelta(days=1)
    
    for h_team, a_team in teams:
        match_mock = {
            "home_team": h_team,
            "away_team": a_team,
            "commence_time": base_time.isoformat() + "Z",
            "bookmakers": []
        }
        
        for bookie in bookies:
            # H2H Bookie Margin applied
            base_prob = random.uniform(0.4, 0.6)
            h_odds = 1 / (base_prob + 0.05)
            a_odds = 1 / ((1 - base_prob) + 0.05)
            
            match_mock["bookmakers"].append({
                "title": bookie,
                "markets": [
                    {
                        "key": "h2h",
                        "outcomes": [
                            {"name": h_team, "price": round(h_odds, 2)},
                            {"name": a_team, "price": round(a_odds, 2)}
                        ]
                    }
                ]
            })
            
        mock_data.append(match_mock)
        
    return mock_data

if __name__ == "__main__":
    odds = fetch_live_odds()
    parsed = parse_odds(odds)
    print(f"Fetched {len(parsed)} real-time market lines.")
