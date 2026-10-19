from app.database import get_db_cursor
import json

with get_db_cursor(dictionary=True) as (conn, cur):
    # Check site 192 (which has Server Room, Parking, Floor Tour)
    cur.execute("""
        SELECT c.oid as checklist_id, c.title, c.checkpoint_id, c.is_active,
               cp.name as cp_name, cp.qr_code, cp.order, cp.latitude, cp.longitude, cp.radius
        FROM PATROL_CHECKLISTS c
        LEFT JOIN PATROL_CHECKPOINTS cp ON c.checkpoint_id = cp.oid
        WHERE c.site_ids LIKE '%192%'
        ORDER BY c.title, cp.order
    """)
    rows = cur.fetchall()
    print(f"Site 192 checkpoints & checklists ({len(rows)}):")
    for r in rows:
        print(r)

    # Also let's check site 1 or other sites
    cur.execute("SELECT * FROM PATROL_CHECKPOINTS WHERE site_id=1")
    print("Site 1 checkpoints:", cur.fetchall())
