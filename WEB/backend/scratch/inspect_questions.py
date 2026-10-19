from app.database import get_db_cursor

with get_db_cursor(dictionary=True) as (conn, cur):
    cur.execute("""
        SELECT c.oid as checklist_id, c.title, ql.oid as link_id, ql.order as q_order,
               q.oid as question_id, q.text, q.response_type, ql.requires_photo
        FROM PATROL_CHECKLISTS c
        JOIN PATROL_CHECKLIST_QUESTION_LINKS ql ON c.oid = ql.checklist_id
        JOIN PATROL_QUESTIONS q ON ql.question_id = q.oid
        WHERE c.site_ids LIKE '%192%'
        ORDER BY c.oid, ql.order
        LIMIT 20
    """)
    rows = cur.fetchall()
    print(f"Questions for site 192 ({len(rows)} found):")
    for r in rows:
        print(r)
