import mysql.connector
from mysql.connector import pooling
import os
from app.config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME

db_pool = None

def get_db_connection():
    try:
        return mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
    except mysql.connector.Error as err:
        print(f"Error connecting to database: {err}")
        return None
