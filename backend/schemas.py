from pydantic import BaseModel
from typing import Optional
import datetime

class MatchBase(BaseModel):
    home_team: str
    away_team: str
    venue: str
    match_date: datetime.datetime
    status: str

class MatchCreate(MatchBase):
    pass

class Match(MatchBase):
    id: int

    class Config:
        from_attributes = True

class BetBase(BaseModel):
    match_id: int
    market: str
    selection: str
    bookmaker_odds: float
    model_probability: float
    ev_percentage: float
    is_value_bet: bool
    bookmaker: str

class BetCreate(BetBase):
    pass

class Bet(BetBase):
    id: int

    class Config:
        from_attributes = True

class DashboardStats(BaseModel):
    total_ev_bets: int
    avg_ev_percentage: float
    total_matches_upcoming: int
