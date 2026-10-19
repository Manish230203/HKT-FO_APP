import sys
from app.database import get_db_cursor

try:
    with get_db_cursor(dictionary=True) as (conn, cur):
        cur.execute("SHOW TABLES LIKE 'PATROL_%'")
        tables = [list(r.values())[0] for r in cur.fetchall()]
        print("Patrol Tables:", tables)

        for tbl in ["PATROL_CHECKPOINTS", "PATROL_CHECKLISTS", "PATROL_QUESTIONS", "PATROL_CHECKLIST_QUESTION_LINKS", "PATROL_TOURS", "PATROL_SHIFTS"]:
            try:
                cur.execute(f"SELECT count(*) as cnt FROM {tbl}")
                print(f"{tbl} count:", cur.fetchone()['cnt'])
            except Exception as e:
                print(f"{tbl} error:", e)

        cur.execute("SELECT * FROM PATROL_CHECKPOINTS LIMIT 5")
        print("Sample Checkpoints:", cur.fetchall())

        cur.execute("SELECT * FROM PATROL_CHECKLISTS LIMIT 5")
        print("Sample Checklists:", cur.fetchall())

        cur.execute("SELECT * FROM PATROL_TOURS LIMIT 5")
        print("Sample Tours:", cur.fetchall())
except Exception as e:
    print("Database error:", e)
