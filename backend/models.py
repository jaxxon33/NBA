from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from database import Base
import datetime

class Match(Base):
    __tablename__ = "matches"

    id = Column(Integer, primary_key=True, index=True)
    home_team = Column(String, index=True)
    away_team = Column(String, index=True)
    venue = Column(String)
    match_date = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String, default="upcoming") # upcoming, completed

class Bet(Base):
    __tablename__ = "bets"

    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(Integer)
    market = Column(String) # H2H, Line, Total, Player Props
    selection = Column(String)
    bookmaker_odds = Column(Float)
    model_probability = Column(Float)
    ev_percentage = Column(Float)
    is_value_bet = Column(Boolean, default=False)
    bookmaker = Column(String)
