from app.database import get_db_cursor
import json

with get_db_cursor(dictionary=True) as (conn, cur):
    cur.execute("SELECT DISTINCT site_id FROM PATROL_CHECKPOINTS")
    print("Checkpoint Site IDs:", [r['site_id'] for r in cur.fetchall()])

    cur.execute("SELECT oid, title, site_ids, checkpoint_id, is_active FROM PATROL_CHECKLISTS WHERE is_active=1")
    active_cls = cur.fetchall()
    print(f"Active Checklists count: {len(active_cls)}")
    
    cur.execute("SELECT oid, title, site_ids, checkpoint_id, is_active FROM PATROL_CHECKLISTS")
    all_cls = cur.fetchall()
    print(f"Total Checklists count: {len(all_cls)}")
    
    tours_map = {}
    for c in all_cls:
        title = c['title'] or ''
        parts = title.split(' - ')
        tour_name = parts[0].strip() if len(parts) > 1 else title.strip()
        site_ids = []
        if c.get('site_ids'):
            try:
                site_ids = json.loads(c['site_ids'])
            except:
                pass
        for s in site_ids:
            if s not in tours_map:
                tours_map[s] = set()
            tours_map[s].add(tour_name)
    print("Tours per site (from Checklists):", tours_map)

    # Check distinct tour_name from PATROL_TOURS
    cur.execute("SELECT DISTINCT site_id, tour_name FROM PATROL_TOURS")
    print("Distinct past tours from PATROL_TOURS:", cur.fetchall())
