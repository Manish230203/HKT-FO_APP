from app.database import get_db_cursor

with get_db_cursor(dictionary=True) as (conn, cur):
    cur.execute("""
        SELECT e.oid, e.name, e.emp_code, e.site, s.name as site_name, d.name as designation
        FROM EMPLOYEE e
        LEFT JOIN SITE s ON e.site = s.oid
        LEFT JOIN DESIGNATION d ON e.DESIGNATION = d.oid
        WHERE e.active = 1 AND (d.name LIKE '%Officer%' OR d.name LIKE '%Guard%' OR d.name LIKE '%Patrol%' OR e.site IS NOT NULL)
        LIMIT 10
    """)
    print("Sample Employees:", cur.fetchall())

    cur.execute("SELECT oid, name FROM SITE WHERE oid IN (190, 192, 189, 1, 2)")
    print("Sites:", cur.fetchall())
