import mysql.connector
from mysql.connector import pooling
import threading
import time
import os
from app.config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME

_db_pool = None
_pool_lock = threading.Lock()
_last_pool_attempt = 0

def get_db_pool():
    global _db_pool, _last_pool_attempt
    if _db_pool is not None:
        return _db_pool

    with _pool_lock:
        if _db_pool is not None:
            return _db_pool

        now = time.time()
        # Cooldown of 5 seconds between failed pool creation attempts to prevent connection flooding
        if now - _last_pool_attempt < 5:
            return None

        _last_pool_attempt = now
        try:
            _db_pool = mysql.connector.pooling.MySQLConnectionPool(
                pool_name="hk_app_pool",
                pool_size=5,
                pool_reset_session=True,
                host=DB_HOST,
                user=DB_USER,
                password=DB_PASSWORD,
                database=DB_NAME
            )
        except Exception as e:
            print(f"Error creating connection pool: {e}")
            _db_pool = None
    return _db_pool

def get_db_connection():
    try:
        pool = get_db_pool()
        if pool:
            try:
                return pool.get_connection()
            except mysql.connector.Error as pool_err:
                print(f"Pool connection error: {pool_err}")
        return mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
    except mysql.connector.Error as err:
        print(f"Error connecting to database: {err}")
        return None
