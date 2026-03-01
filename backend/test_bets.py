import sys
import os

from sqlalchemy.orm import Session
from database import SessionLocal
from main import get_ev_bets

db = SessionLocal()
try:
    bets = get_ev_bets(db)
    print("Found {} EV bets.".format(len(bets)))
    if len(bets) > 0:
        print("First bet match date:", bets[0].get("match_date") if isinstance(bets[0], dict) else bets[0])
except Exception as e:
    print("Error:", e)
finally:
    db.close()
