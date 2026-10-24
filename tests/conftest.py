"""
Baari — tests/conftest.py
Test fixtures: in-memory / temporary SQLite database, test client, seeded users.
"""

import os
import sys
import datetime
import pytest

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Override DATABASE_URL BEFORE importing app modules
os.environ["DATABASE_URL"] = "sqlite:///./test_baari.db"
os.environ["SECRET_KEY"] = "test-secret-key-do-not-use-in-production"

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.database import Base
from app.models import Department, Doctor, User, Setting
from app.security import hash_password
from app.main import app
from app.dependencies import get_db


# ── Test DB setup ──────────────────────────────────────────────────────────

TEST_DB_URL = "sqlite:///./test_baari.db"

test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})


@event.listens_for(test_engine, "connect")
def _set_sqlite_pragmas(dbapi_conn, _connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA foreign_keys=ON;")
    cursor.close()


TestSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)


def override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


# ── Fixtures ───────────────────────────────────────────────────────────────

@pytest.fixture(scope="session", autouse=True)
def create_test_db():
    """Create all tables once for the test session."""
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)
    if os.path.exists("./test_baari.db"):
        try:
            os.remove("./test_baari.db")
        except Exception:
            pass
    for suffix in ["-wal", "-shm"]:
        path = f"./test_baari.db{suffix}"
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception:
                pass


@pytest.fixture(autouse=True)
def clean_tables():
    """Truncate all tables before each test for isolation."""
    db = TestSessionLocal()
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()
    db.close()


@pytest.fixture
def db():
    """Provide a test database session."""
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client():
    """Provide a test HTTP client."""
    return TestClient(app)


@pytest.fixture
def seed_data(db):
    """
    Seed departments, doctors, admin, and staff users for tests.
    """
    dept_g = Department(name="General Medicine", code="G", avg_service_minutes=8.0)
    dept_o = Department(name="Orthopedics", code="O", avg_service_minutes=10.0)
    db.add_all([dept_g, dept_o])
    db.flush()

    doc1 = Doctor(name="Dr. Test1", department_id=dept_g.id, active=True)
    doc2 = Doctor(name="Dr. Test2", department_id=dept_g.id, active=True)
    doc3 = Doctor(name="Dr. Test3", department_id=dept_o.id, active=True)
    db.add_all([doc1, doc2, doc3])
    db.flush()

    admin_pw = "AdminPass123!"
    admin_user = User(
        username="testadmin",
        password_hash=hash_password(admin_pw),
        role="admin",
        department_id=None,
        active=True,
        must_change_password=False,
        failed_logins=0,
        created_at=datetime.datetime.now(datetime.UTC),
    )
    db.add(admin_user)
    db.flush()

    staff_pw = "StaffPass123!"
    staff_g = User(
        username="staff_g_test",
        password_hash=hash_password(staff_pw),
        role="staff",
        department_id=dept_g.id,
        active=True,
        must_change_password=True,
        failed_logins=0,
        created_at=datetime.datetime.now(datetime.UTC),
    )
    db.add(staff_g)
    db.flush()

    staff_o = User(
        username="staff_o_test",
        password_hash=hash_password(staff_pw),
        role="staff",
        department_id=dept_o.id,
        active=True,
        must_change_password=False,
        failed_logins=0,
        created_at=datetime.datetime.now(datetime.UTC),
    )
    db.add(staff_o)
    db.flush()

    disabled_user = User(
        username="disabled_user",
        password_hash=hash_password("DisabledPass1!"),
        role="staff",
        department_id=dept_g.id,
        active=False,
        must_change_password=False,
        failed_logins=0,
        created_at=datetime.datetime.now(datetime.UTC),
    )
    db.add(disabled_user)

    db.add(Setting(key="arrival_buffer_minutes", value="15"))
    db.add(Setting(key="reminder_threshold_minutes", value="20"))

    db.commit()

    return {
        "dept_g": dept_g,
        "dept_o": dept_o,
        "doc1": doc1,
        "doc2": doc2,
        "doc3": doc3,
        "admin_user": admin_user,
        "admin_pw": admin_pw,
        "staff_g": staff_g,
        "staff_o": staff_o,
        "staff_pw": staff_pw,
        "disabled_user": disabled_user,
    }


def login_as(client: TestClient, username: str, password: str) -> dict:
    """Helper: login and return the response + extract CSRF token."""
    resp = client.post("/api/login", json={"username": username, "password": password})
    csrf = resp.headers.get("X-CSRF-Token", "")
    return {"response": resp, "csrf": csrf}
