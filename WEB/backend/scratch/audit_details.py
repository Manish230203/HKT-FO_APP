import sys
import os
sys.path.append(os.path.abspath('.'))

from app.database import get_db_connection

def main():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    print("=== MYSQL VERSION ===")
    cursor.execute("SELECT VERSION() as version")
    print(cursor.fetchone())

    tables = [
        'FIELD_OFFICER_ASSIGNED_VISITS',
        'FIELD_OFFICER_VISIT_FREQUENCY',
        'FIELD_OFFICER_NEW_CLIENT_VISITS',
        'SITE_VISIT_SESSIONS',
        'FIELD_OFFICER_DAY_VISIT_REPORTS',
        'FIELD_OFFICER_NIGHT_VISIT_REPORTS',
        'FIELD_OFFICER_GENERAL_VISIT_REPORTS'
    ]

    print("\n=== TABLE ENGINES & ROW COUNTS ===")
    for t in tables:
        cursor.execute(f"SHOW TABLE STATUS WHERE Name = '{t}'")
        row = cursor.fetchone()
        if row:
            print(f"{t}: Engine={row.get('Engine')}, Collation={row.get('Collation')}, Rows={row.get('Rows')}")
        else:
            print(f"{t}: NOT FOUND")

    print("\n=== FIELD_OFFICER_NEW_CLIENT_VISITS SCHEMA ===")
    cursor.execute("DESCRIBE FIELD_OFFICER_NEW_CLIENT_VISITS")
    for col in cursor.fetchall():
        print(f"  {col['Field']}: {col['Type']}, Null={col['Null']}, Key={col['Key']}, Default={col['Default']}")

    print("\n=== SESSIONS & REPORT TABLES site_id COLUMNS ===")
    for t in ['SITE_VISIT_SESSIONS', 'FIELD_OFFICER_DAY_VISIT_REPORTS', 'FIELD_OFFICER_NIGHT_VISIT_REPORTS', 'FIELD_OFFICER_GENERAL_VISIT_REPORTS']:
        cursor.execute(f"SHOW COLUMNS FROM {t} LIKE 'site_id'")
        c = cursor.fetchone()
        cursor.execute(f"SELECT COUNT(*) as cnt FROM {t}")
        total = cursor.fetchone()['cnt']
        cursor.execute(f"SELECT COUNT(*) as cnt FROM {t} WHERE site_id IS NULL")
        null_cnt = cursor.fetchone()['cnt']
        print(f"{t}: site_id {c['Type']}, Null={c['Null']}, Key={c['Key']} | Total rows={total}, site_id IS NULL={null_cnt}")

    print("\n=== ALL ROWS IN FIELD_OFFICER_NEW_CLIENT_VISITS ===")
    cursor.execute("""
        SELECT ncv.*, av.plan_code, av.planning_type, av.employee_oid, av.status, av.visit_date, av.week_start_date, av.planning_month, av.planning_year
        FROM FIELD_OFFICER_NEW_CLIENT_VISITS ncv
        LEFT JOIN FIELD_OFFICER_ASSIGNED_VISITS av ON ncv.plan_oid = av.oid
    """)
    rows = cursor.fetchall()
    print(f"Count: {len(rows)}")
    for r in rows:
        print(r)

    print("\n=== CHECK PLANS WITH MULTIPLE CUSTOM VISITS ===")
    cursor.execute("""
        SELECT plan_oid, COUNT(*) as custom_count
        FROM FIELD_OFFICER_NEW_CLIENT_VISITS
        GROUP BY plan_oid
        HAVING COUNT(*) > 1
    """)
    mult = cursor.fetchall()
    print(f"Plans with multiple custom visits: {mult}")

    cursor.close()
    conn.close()

if __name__ == '__main__':
    main()
