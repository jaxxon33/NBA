from database import engine, SessionLocal
import models
from sqlalchemy.orm import Session

def clear_data():
    db: Session = SessionLocal()
    try:
        db.query(models.Bet).delete()
        db.query(models.Match).delete()
        db.commit()
        print("Cleared existing matches and bets.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    clear_data()
