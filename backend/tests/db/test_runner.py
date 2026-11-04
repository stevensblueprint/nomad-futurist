from __future__ import annotations

import psycopg
import pytest

import migrate


def write(directory, version, name, up, down):
    (directory / f"{version}_{name}.up.sql").write_text(up)
    (directory / f"{version}_{name}.down.sql").write_text(down)


@pytest.fixture
def versions(tmp_path):
    write(tmp_path, "0001", "alpha", "CREATE TABLE alpha (id int);", "DROP TABLE alpha;")
    write(tmp_path, "0002", "beta", "CREATE TABLE beta (id int);", "DROP TABLE beta;")
    return tmp_path


def tables(conn):
    return {r[0] for r in conn.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public'")}


def test_load_orders_and_checksums(versions):
    ms = migrate.load_migrations(versions)
    assert [m.version for m in ms] == ["0001", "0002"]
    assert ms[0].checksum != ms[1].checksum


def test_load_rejects_missing_down(versions):
    (versions / "0002_beta.down.sql").unlink()
    with pytest.raises(migrate.MigrationError):
        migrate.load_migrations(versions)


def test_load_rejects_gap(versions):
    write(versions, "0004", "gamma", "SELECT 1;", "SELECT 1;")
    with pytest.raises(migrate.MigrationError):
        migrate.load_migrations(versions)


def test_up_applies_in_order_and_records(fresh_db_url, versions):
    ms = migrate.load_migrations(versions)
    with psycopg.connect(fresh_db_url, autocommit=True) as c:
        assert migrate.migrate_up(c, ms) == ["0001", "0002"]
        assert {"alpha", "beta", "schema_migrations"} <= tables(c)
        assert [r[0] for r in c.execute("SELECT version FROM schema_migrations ORDER BY version")] == ["0001", "0002"]


def test_up_twice_is_idempotent(fresh_db_url, versions):
    ms = migrate.load_migrations(versions)
    with psycopg.connect(fresh_db_url, autocommit=True) as c:
        migrate.migrate_up(c, ms)
        assert migrate.migrate_up(c, ms) == []


def test_failed_migration_rolls_back_that_version_only(fresh_db_url, versions):
    write(versions, "0003", "bad", "CREATE TABLE gamma (id int); SELECT 1/0;", "DROP TABLE gamma;")
    ms = migrate.load_migrations(versions)
    with psycopg.connect(fresh_db_url, autocommit=True) as c:
        with pytest.raises(psycopg.errors.DivisionByZero):
            migrate.migrate_up(c, ms)
        assert "gamma" not in tables(c)
        assert migrate.applied_versions(c).keys() == {"0001", "0002"}


def test_down_reverses_last_steps(fresh_db_url, versions):
    ms = migrate.load_migrations(versions)
    with psycopg.connect(fresh_db_url, autocommit=True) as c:
        migrate.migrate_up(c, ms)
        assert migrate.migrate_down(c, ms, steps=1) == ["0002"]
        assert "beta" not in tables(c) and "alpha" in tables(c)
        assert migrate.applied_versions(c).keys() == {"0001"}


def test_check_reports_pending_and_changed_checksum(fresh_db_url, versions):
    ms = migrate.load_migrations(versions)
    with psycopg.connect(fresh_db_url, autocommit=True) as c:
        migrate.migrate_up(c, ms[:1])
        assert any("pending" in p for p in migrate.check(c, ms))
        migrate.migrate_up(c, ms)
        assert migrate.check(c, ms) == []
        (versions / "0001_alpha.up.sql").write_text("CREATE TABLE alpha (id bigint);")
        changed = migrate.load_migrations(versions)
        assert any("checksum" in p for p in migrate.check(c, changed))


def test_check_reports_unknown_applied_version(fresh_db_url, versions):
    ms = migrate.load_migrations(versions)
    with psycopg.connect(fresh_db_url, autocommit=True) as c:
        migrate.migrate_up(c, ms)
        assert any("not in repository" in p for p in migrate.check(c, ms[:1]))
