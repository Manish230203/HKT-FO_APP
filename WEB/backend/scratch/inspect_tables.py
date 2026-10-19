import sys
import os
sys.path.append(os.path.abspath('.'))

from app.database import get_db_connection

def inspect_db():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    target_tables = [
        'FIELD_OFFICER_ASSIGNED_VISITS',
        'FIELD_OFFICER_VISIT_FREQUENCY',
        'FIELD_OFFICER_NEW_CLIENT_VISITS',
    ]
    
    for tbl in target_tables:
        cursor.execute(f"DESCRIBE `{tbl}`")
        cols = cursor.fetchall()
        print(f"\nTABLE: {tbl}")
        for c in cols:
            print(f"  {c['Field']}: {c['Type']} (Null: {c['Null']}, Key: {c['Key']}, Default: {c['Default']})")

    cursor.close()
    conn.close()

if __name__ == '__main__':
    inspect_db()
