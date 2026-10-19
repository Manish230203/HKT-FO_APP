import sys
import os
sys.path.append(os.path.abspath('.'))

from app.database import get_db_connection

def inspect_data():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    print("=== SAMPLE FIELD_OFFICER_ASSIGNED_VISITS ===")
    cursor.execute("SELECT * FROM FIELD_OFFICER_ASSIGNED_VISITS ORDER BY oid DESC LIMIT 5")
    for r in cursor.fetchall():
        print(r)
        
    print("\n=== SAMPLE FIELD_OFFICER_VISIT_FREQUENCY ===")
    cursor.execute("SELECT * FROM FIELD_OFFICER_VISIT_FREQUENCY ORDER BY oid DESC LIMIT 5")
    for r in cursor.fetchall():
        print(r)

    print("\n=== SAMPLE FIELD_OFFICER_NEW_CLIENT_VISITS ===")
    cursor.execute("SELECT * FROM FIELD_OFFICER_NEW_CLIENT_VISITS ORDER BY oid DESC LIMIT 5")
    rows = cursor.fetchall()
    print(f"Total rows found: {len(rows)}")
    for r in rows:
        print(r)

    cursor.close()
    conn.close()

if __name__ == '__main__':
    inspect_data()
