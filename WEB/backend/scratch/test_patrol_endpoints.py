from app.database import get_db_cursor
import json
import math

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

with get_db_cursor(dictionary=True) as (conn, cur):
    # Test getting tours for site 192
    site_id = 192
    cur.execute("""
        SELECT oid, title, site_ids, checkpoint_id, is_active
        FROM PATROL_CHECKLISTS
        WHERE site_ids LIKE %s
    """, (f"%{site_id}%",))
    cls = cur.fetchall()
    
    tours = {}
    for c in cls:
        title = c['title'] or ''
        parts = title.split(' - ')
        tour_name = parts[0].strip() if len(parts) > 1 else title.strip()
        if tour_name not in tours:
            tours[tour_name] = []
        if c['checkpoint_id']:
            tours[tour_name].append(c['checkpoint_id'])

    print("Discovered Tours for site 192:", tours)

    for tour_name, cp_ids in tours.items():
        if cp_ids:
            format_strings = ','.join(['%s'] * len(cp_ids))
            cur.execute(f"""
                SELECT oid, name, qr_code, `order`, latitude, longitude, radius
                FROM PATROL_CHECKPOINTS
                WHERE oid IN ({format_strings})
                ORDER BY `order`, oid
            """, tuple(cp_ids))
            cps = cur.fetchall()
            print(f"Tour: {tour_name} ({len(cps)} checkpoints):")
            for cp in cps:
                print("   CP:", cp)
