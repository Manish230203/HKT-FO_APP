import sys
import os
sys.path.append(os.path.abspath('.'))

from app.database import get_db_connection

def inspect_fks():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    tables = [
        'FIELD_OFFICER_ASSIGNED_VISITS',
        'FIELD_OFFICER_VISIT_FREQUENCY',
        'FIELD_OFFICER_NEW_CLIENT_VISITS',
        'SITE_VISIT_SESSIONS',
        'FIELD_OFFICER_DAY_VISIT_REPORTS',
        'FIELD_OFFICER_NIGHT_VISIT_REPORTS',
        'FIELD_OFFICER_GENERAL_VISIT_REPORTS',
    ]
    
    for t in tables:
        print(f"\n=== FOREIGN KEYS & INDEXES FOR {t} ===")
        cursor.execute(f"""
            SELECT 
                CONSTRAINT_NAME, 
                COLUMN_NAME, 
                REFERENCED_TABLE_NAME, 
                REFERENCED_COLUMN_NAME
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = '{t}'
              AND REFERENCED_TABLE_NAME IS NOT NULL
        """)
        fks = cursor.fetchall()
        for fk in fks:
            print(f"  FK: {fk['CONSTRAINT_NAME']}: {fk['COLUMN_NAME']} -> {fk['REFERENCED_TABLE_NAME']}.{fk['REFERENCED_COLUMN_NAME']}")
            
        cursor.execute(f"SHOW INDEX FROM `{t}`")
        idxs = cursor.fetchall()
        print("  INDEXES:")
        for idx in idxs:
            print(f"    {idx['Key_name']} on {idx['Column_name']} (Unique: {idx['Non_unique'] == 0})")

    cursor.close()
    conn.close()

if __name__ == '__main__':
    inspect_fks()
