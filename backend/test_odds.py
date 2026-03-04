import odds_api
try:
    live_odds = odds_api.fetch_live_odds()
    parsed = odds_api.parse_odds(live_odds)
    
    unique_matches = {}
    for odd in parsed:
        match_key = f"{odd['home_team']} _ {odd['away_team']}"
        if match_key not in unique_matches:
            unique_matches[match_key] = {
                "h_team": odd["home_team"],
                "a_team": odd["away_team"]
            }
            
    upcoming = list(unique_matches.values())
    print("Parsed Upcoming:", upcoming)
    if not upcoming:
        print("Empty upcoming list!")
except Exception as e:
    import traceback
    traceback.print_exc()
