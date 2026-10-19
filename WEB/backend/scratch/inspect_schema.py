import sys
import os
sys.path.append(os.path.abspath('.'))

from app.database import get_db_connection

def inspect_db():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    # 1. Show all matching tables
    cursor.execute("SHOW TABLES")
    all_tables = [list(r.values())[0] for r in cursor.fetchall()]
    matching = [t for t in all_tables if any(k in t.upper() for k in ['VISIT', 'FIELD_OFFICER', 'SITE', 'CLIENT', 'GPS', 'SESSION'])]
    print("MATCHING TABLES:")
    for t in sorted(matching):
        print("  -", t)
        
    # 2. Check specific tables and their columns
    target_tables = [
        'FIELD_OFFICER_ASSIGNED_VISITS',
        'FIELD_OFFICER_VISIT_FREQUENCY',
        'FIELD_OFFICER_NEW_CLIENT_VISITS',
        'SITE_VISIT_SESSIONS',
        'FIELD_OFFICER_DAY_VISIT_REPORTS',
        'FIELD_OFFICER_NIGHT_VISIT_REPORTS',
        'FIELD_OFFICER_GENERAL_VISIT_REPORTS',
        'SITE',
        'CLIENTT',
        'GPS_LOCATION_LOGS',
        'GPS_LOGS'
    ]
    
    for tbl in target_tables:
        if tbl in all_tables:
            cursor.execute(f"DESCRIBE `{tbl}`")
            cols = cursor.fetchall()
            print(f"\nTABLE: {tbl}")
            for c in cols:
                print(f"  {c['Field']}: {c['Type']} (Null: {c['Null']}, Key: {c['Key']}, Default: {c['Default']})")
        else:
            print(f"\nTABLE {tbl} DOES NOT EXIST!")

    cursor.close()
    conn.close()

if __name__ == '__main__':
    inspect_db()
