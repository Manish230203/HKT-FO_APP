from contextlib import contextmanager
import mysql.connector
from mysql.connector import pooling
import threading
import time
import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME

# --- RAW MYSQL CONNECTION POOL ---
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
                database=DB_NAME,
                init_command="SET time_zone = '+05:30'"
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
            database=DB_NAME,
            init_command="SET time_zone = '+05:30'"
        )
    except mysql.connector.Error as err:
        print(f"Error connecting to database: {err}")
        return None

@contextmanager
def get_db_cursor(dictionary=False, commit=False):
    """
    Context manager that guarantees connection and cursor are closed properly.
    Usage:
        with get_db_cursor(dictionary=True, commit=True) as (conn, cursor):
            cursor.execute(...)
    """
    conn = get_db_connection()
    if conn is None:
        raise RuntimeError("Could not establish database connection")
    cursor = None
    try:
        cursor = conn.cursor(dictionary=dictionary)
        yield conn, cursor
        if commit:
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        if cursor:
            try:
                cursor.close()
            except Exception:
                pass
        if conn:
            try:
                conn.close()
            except Exception:
                pass

# --- SQLALCHEMY ORM ENGINE & SESSIONS ---
SQLALCHEMY_DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"init_command": "SET time_zone = '+05:30'"},
    pool_pre_ping=True,
    pool_size=3,
    max_overflow=2,
    pool_recycle=1800
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_patrol_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

