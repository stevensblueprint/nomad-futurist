"""Tests for the read-only schema report (report.build_report and the CLI)."""
from __future__ import annotations

import json
import os
import re
import uuid

import psycopg
from psycopg.conninfo import make_conninfo

import migrate
import report
from conftest import REAL_VERSIONS, insert_user

EXPECTED_TABLES = {
    "users", "founder_profiles", "projects", "project_founders",
    "project_progress_state", "project_documents", "validation", "tasks",
    "nda_acceptances", "schema_migrations",
}


def _hash_for(url: str, ms: list[migrate.Migration]) -> str:
    with psycopg.connect(url, autocommit=True) as c:
        migrate.migrate_up(c, ms)
        return report.build_report(c)["hash"]


def test_report_of_fully_migrated_fresh_database(fresh_db_url):
    ms = migrate.load_migrations(REAL_VERSIONS)
    with psycopg.connect(fresh_db_url, autocommit=True) as c:
        migrate.migrate_up(c, ms)
        r = report.build_report(c)

    assert set(r["schema"]["tables"]) == EXPECTED_TABLES
    assert [m["version"] for m in r["migrations"]] == [f"{i:04d}" for i in range(1, 11)]
    assert set(r["row_counts"]) == EXPECTED_TABLES
    assert r["row_counts"]["schema_migrations"] == 10
    assert all(v == 0 for k, v in r["row_counts"].items() if k != "schema_migrations")
    assert re.fullmatch(r"[0-9a-f]{64}", r["hash"])


def test_hash_identical_for_two_fresh_databases(fresh_db_url):
    ms = migrate.load_migrations(REAL_VERSIONS)
    h1 = _hash_for(fresh_db_url, ms)
    admin = os.environ["TEST_DATABASE_URL"]
    name = f"test_second_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(admin, autocommit=True) as c:
        c.execute(f'CREATE DATABASE "{name}"')
    try:
        h2 = _hash_for(make_conninfo(admin, dbname=name), ms)
    finally:
        with psycopg.connect(admin, autocommit=True) as c:
            c.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
    assert h1 == h2


def test_hash_identical_across_owners(fresh_db_url):
    ms = migrate.load_migrations(REAL_VERSIONS)
    baseline = _hash_for(fresh_db_url, ms)

    admin = os.environ["TEST_DATABASE_URL"]
    name = f"test_owned_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(admin, autocommit=True) as c:
        c.execute("DROP ROLE IF EXISTS report_owner")
        c.execute("CREATE ROLE report_owner LOGIN CREATEDB PASSWORD 'owner-secret'")
        c.execute(f'CREATE DATABASE "{name}" OWNER report_owner')
    try:
        owned = make_conninfo(admin, dbname=name, user="report_owner", password="owner-secret")
        with psycopg.connect(owned, autocommit=True) as c:
            migrate.migrate_up(c, ms)
            assert report.build_report(c)["hash"] == baseline
    finally:
        with psycopg.connect(admin, autocommit=True) as c:
            c.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
            c.execute("DROP ROLE IF EXISTS report_owner")


def _hash_after_change(fresh_db_url, change_sql: str) -> tuple[str, str]:
    ms = migrate.load_migrations(REAL_VERSIONS)
    with psycopg.connect(fresh_db_url, autocommit=True) as c:
        migrate.migrate_up(c, ms)
        before = report.build_report(c)["hash"]
        c.execute(change_sql)
        after = report.build_report(c)["hash"]
    return before, after


def test_hash_changes_on_column_type_change(fresh_db_url):
    before, after = _hash_after_change(
        fresh_db_url, "ALTER TABLE projects ALTER COLUMN funding_min TYPE numeric(12,2)"
    )
    assert before != after


def test_hash_changes_on_fk_on_delete_rule(fresh_db_url):
    before, after = _hash_after_change(
        fresh_db_url,
        "ALTER TABLE project_founders DROP CONSTRAINT fk_project_founders_project; "
        "ALTER TABLE project_founders ADD CONSTRAINT fk_project_founders_project "
        "FOREIGN KEY (project_id) REFERENCES projects (project_id) ON DELETE RESTRICT",
    )
    assert before != after


def test_hash_changes_on_dropped_index(fresh_db_url):
    before, after = _hash_after_change(fresh_db_url, "DROP INDEX idx_tasks_owner_id")
    assert before != after


def test_hash_changes_on_check_constraint_change(fresh_db_url):
    before, after = _hash_after_change(
        fresh_db_url,
        "ALTER TABLE tasks DROP CONSTRAINT ck_tasks_priority; "
        "ALTER TABLE tasks ADD CONSTRAINT ck_tasks_priority CHECK "
        "(priority IS NULL OR priority IN ('critical', 'standard', 'low'))",
    )
    assert before != after


def test_hash_changes_on_dropped_not_null(fresh_db_url):
    before, after = _hash_after_change(
        fresh_db_url, "ALTER TABLE projects ALTER COLUMN project_name DROP NOT NULL"
    )
    assert before != after


def test_hash_changes_on_column_default_change(fresh_db_url):
    before, after = _hash_after_change(
        fresh_db_url, "ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'assigned'"
    )
    assert before != after


def test_report_is_read_only_and_repeatable(fresh_db_url):
    ms = migrate.load_migrations(REAL_VERSIONS)
    with psycopg.connect(fresh_db_url, autocommit=True) as c:
        migrate.migrate_up(c, ms)
        first = report.build_report(c)
        second = report.build_report(c)
    assert first["hash"] == second["hash"]
    assert first["row_counts"] == second["row_counts"]


def test_report_on_empty_database_creates_nothing(fresh_db_url):
    with psycopg.connect(fresh_db_url, autocommit=True) as c:
        r = report.build_report(c)
        assert r["migrations"] == []
        assert "schema_migrations" not in r["schema"]["tables"]
        assert "schema_migrations" not in r["row_counts"]
        # the report must not have created the tracking table
        assert c.execute("SELECT to_regclass('schema_migrations') IS NOT NULL").fetchone()[0] is False


def test_report_row_counts_reflect_inserted_rows(fresh_db_url):
    ms = migrate.load_migrations(REAL_VERSIONS)
    with psycopg.connect(fresh_db_url, autocommit=True) as c:
        migrate.migrate_up(c, ms)
        insert_user(c)
        r = report.build_report(c)
        assert r["row_counts"]["users"] == 1


def test_report_cli_prints_json_and_returns_zero(fresh_db_url, monkeypatch, capsys):
    ms = migrate.load_migrations(REAL_VERSIONS)
    with psycopg.connect(fresh_db_url, autocommit=True) as c:
        migrate.migrate_up(c, ms)
        expected = report.build_report(c)["hash"]
    monkeypatch.setenv("DATABASE_URL", fresh_db_url)
    assert migrate.main(["report"]) == 0
    out = capsys.readouterr().out
    data = json.loads(out)
    assert data["hash"] == expected
