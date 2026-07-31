import mysql.connector
from mysql.connector import pooling
import os
from app.config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME

try:
    db_pool = pooling.MySQLConnectionPool(
        pool_name="ama_pool",
        pool_size=10,
        pool_reset_session=True,
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME
    )
    print("Database connection pool created.")
except mysql.connector.Error as err:
    print(f"Error creating pool: {err}")
    db_pool = None

def get_db_connection():
    try:
        if db_pool:
            return db_pool.get_connection()
        else:
            return mysql.connector.connect(
                host=DB_HOST,
                user=DB_USER,
                password=DB_PASSWORD,
                database=DB_NAME
            )
    except mysql.connector.Error as err:
        print(f"Error connecting to database: {err}")
        return None
