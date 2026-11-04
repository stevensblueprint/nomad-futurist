from __future__ import annotations

import psycopg

import migrate
import verify
from conftest import REAL_VERSIONS


def test_verify_passes_on_fully_migrated_database(fresh_db_url):
    ms = migrate.load_migrations(REAL_VERSIONS)
    with psycopg.connect(fresh_db_url, autocommit=True) as c:
        migrate.migrate_up(c, ms)
        assert verify.verify(c, ms) == []


def test_verify_reports_missing_index(fresh_db_url):
    ms = migrate.load_migrations(REAL_VERSIONS)
    with psycopg.connect(fresh_db_url, autocommit=True) as c:
        migrate.migrate_up(c, ms)
        c.execute("DROP INDEX idx_tasks_owner_id")
        assert any("idx_tasks_owner_id" in p for p in verify.verify(c, ms))


def test_verify_reports_missing_table_and_old_version(fresh_db_url):
    ms = migrate.load_migrations(REAL_VERSIONS)
    with psycopg.connect(fresh_db_url, autocommit=True) as c:
        migrate.migrate_up(c, ms)
        migrate.migrate_down(c, ms, steps=1)
        problems = verify.verify(c, ms)
        assert any("nda_acceptances" in p for p in problems)
        assert any("latest" in p for p in problems)


def test_verify_subcommand_exits_zero_on_migrated_database(fresh_db_url, monkeypatch):
    ms = migrate.load_migrations(REAL_VERSIONS)
    with psycopg.connect(fresh_db_url, autocommit=True) as c:
        migrate.migrate_up(c, ms)
    monkeypatch.setenv("DATABASE_URL", fresh_db_url)
    assert migrate.main(["verify"]) == 0


def test_verify_subcommand_exits_one_after_dropped_index(fresh_db_url, monkeypatch):
    ms = migrate.load_migrations(REAL_VERSIONS)
    with psycopg.connect(fresh_db_url, autocommit=True) as c:
        migrate.migrate_up(c, ms)
        c.execute("DROP INDEX idx_tasks_owner_id")
    monkeypatch.setenv("DATABASE_URL", fresh_db_url)
    assert migrate.main(["verify"]) == 1
