"""Shared fixtures. TEST_DATABASE_URL must point to a disposable PostgreSQL server.

Optional: INTEGRITY_TARGET_DSN points the integrity tests at an already-migrated
database (for example RDS). Every test runs in a transaction that is rolled back,
so no data stays in that database.
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path

import psycopg
import pytest
from psycopg.conninfo import make_conninfo

import migrate

REAL_VERSIONS = Path(__file__).resolve().parents[2] / "migrations" / "versions"


def _admin_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is not set (run backend/scripts/test-db.sh start)")
    return url


@pytest.fixture
def fresh_db_url():
    """An empty throwaway database. Dropped after the test."""
    admin = _admin_url()
    name = f"test_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(admin, autocommit=True) as c:
        c.execute(f'CREATE DATABASE "{name}"')
    try:
        yield make_conninfo(admin, dbname=name)
    finally:
        with psycopg.connect(admin, autocommit=True) as c:
            c.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')


@pytest.fixture(scope="session")
def migrated_dsn():
    """A database with all real migrations applied."""
    target = os.environ.get("INTEGRITY_TARGET_DSN")
    if target:
        yield target
        return
    admin = _admin_url()
    name = f"test_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(admin, autocommit=True) as c:
        c.execute(f'CREATE DATABASE "{name}"')
    dsn = make_conninfo(admin, dbname=name)
    try:
        with psycopg.connect(dsn, autocommit=True) as c:
            migrate.migrate_up(c, migrate.load_migrations(REAL_VERSIONS))
        yield dsn
    finally:
        with psycopg.connect(admin, autocommit=True) as c:
            c.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')


@pytest.fixture
def conn(migrated_dsn):
    """A connection inside a transaction that is always rolled back."""
    with psycopg.connect(migrated_dsn) as c:
        yield c
        c.rollback()


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def insert_user(conn, **kw):
    kw.setdefault("cognito_sub", _unique("sub"))
    kw.setdefault("email", f"{_unique('u')}@example.com")
    kw.setdefault("name", "Test User")
    return conn.execute(
        "INSERT INTO users (cognito_sub, email, name) VALUES (%(cognito_sub)s, %(email)s, %(name)s) RETURNING user_id",
        kw,
    ).fetchone()[0]


def insert_founder(conn, user_id=None):
    user_id = user_id or insert_user(conn)
    return conn.execute(
        "INSERT INTO founder_profiles (user_id, phone) VALUES (%s, '555-0100') RETURNING founder_id",
        (user_id,),
    ).fetchone()[0]


def insert_project(conn, created_by=None, **kw):
    kw.setdefault("project_name", "Nomad Test Project")
    kw.setdefault("description", "A test project")
    kw.setdefault("support_type", "funding")
    kw.setdefault("needs", "Funding for prototype")
    kw.setdefault("funding_min", 1000)
    kw.setdefault("funding_max", 5000)
    kw["created_by"] = created_by
    return conn.execute(
        """INSERT INTO projects (created_by_user_id, project_name, description, support_type,
                                 needs, funding_min, funding_max)
           VALUES (%(created_by)s, %(project_name)s, %(description)s, %(support_type)s,
                   %(needs)s, %(funding_min)s, %(funding_max)s) RETURNING project_id""",
        kw,
    ).fetchone()[0]
