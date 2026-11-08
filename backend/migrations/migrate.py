"""Ordered SQL migration runner for the Nomad PostgreSQL database.

Usage:
  python migrate.py status
  python migrate.py up
  python migrate.py down --steps N --yes
  python migrate.py check       exit 1 if pending, 2 if the database and repo differ
  python migrate.py verify      exit 1 if the deployed schema is not as expected
  python migrate.py report      print the public schema as JSON (structure + hash)

Connection: DATABASE_URL, or the libpq variables (PGHOST, PGUSER, PGPASSWORD,
PGSSLMODE, ...). PGDATABASE defaults to "postgres". Credentials are never read
from files in this repository.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

import psycopg

VERSIONS_DIR = Path(__file__).resolve().parent / "versions"
LOCK_KEYS = (727274, 1)  # fixed two-key advisory lock key for this project
FILE_RE = re.compile(r"^(\d{4})_([a-z0-9_]+)\.(up|down)\.sql$")

CREATE_TRACKING = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version    text PRIMARY KEY,
    name       text NOT NULL,
    checksum   text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
)
"""


class MigrationError(Exception):
    pass


def positive_int(value: str) -> int:
    """argparse type that rejects integers below 1."""
    try:
        n = int(value)
    except ValueError:
        raise argparse.ArgumentTypeError(f"invalid integer: {value}")
    if n < 1:
        raise argparse.ArgumentTypeError("must be >= 1")
    return n


@dataclass(frozen=True)
class Migration:
    version: str
    name: str
    up_sql: str
    down_sql: str

    @property
    def checksum(self) -> str:
        return hashlib.sha256(self.up_sql.encode()).hexdigest()


def load_migrations(directory: Path = VERSIONS_DIR) -> list[Migration]:
    ups: dict[str, tuple[str, str]] = {}
    downs: dict[str, tuple[str, str]] = {}
    for path in sorted(directory.glob("*.sql")):
        m = FILE_RE.match(path.name)
        if not m:
            raise MigrationError(f"bad migration file name: {path.name}")
        version, name, kind = m.groups()
        (ups if kind == "up" else downs)[version] = (name, path.read_text(encoding="utf-8"))
    if ups.keys() != downs.keys():
        raise MigrationError(f"up/down files do not match: {sorted(ups.keys() ^ downs.keys())}")
    versions = sorted(ups)
    if versions != [f"{i:04d}" for i in range(1, len(versions) + 1)]:
        raise MigrationError(f"versions must be 0001..N with no gaps, got {versions}")
    return [Migration(v, ups[v][0], ups[v][1], downs[v][1]) for v in versions]


def connect(url: str | None = None) -> psycopg.Connection:
    url = url or os.environ.get("DATABASE_URL")
    if url:
        return psycopg.connect(url, autocommit=True)
    return psycopg.connect(dbname=os.environ.get("PGDATABASE", "postgres"), autocommit=True)


def _ensure_tracking(conn: psycopg.Connection) -> None:
    conn.execute(CREATE_TRACKING)


def _tracking_exists(conn: psycopg.Connection) -> bool:
    row = conn.execute("SELECT to_regclass('schema_migrations') IS NOT NULL").fetchone()
    return bool(row[0])


def applied_versions(conn: psycopg.Connection, create: bool = True) -> dict[str, tuple[str, str]]:
    if create:
        _ensure_tracking(conn)
    elif not _tracking_exists(conn):
        return {}
    rows = conn.execute("SELECT version, name, checksum FROM schema_migrations ORDER BY version").fetchall()
    return {v: (n, c) for v, n, c in rows}


def _lock(conn: psycopg.Connection) -> None:
    if not conn.execute("SELECT pg_try_advisory_lock(%s, %s)", LOCK_KEYS).fetchone()[0]:
        raise MigrationError("another migration run holds the lock")


def _unlock(conn: psycopg.Connection) -> None:
    try:
        conn.execute("SELECT pg_advisory_unlock(%s, %s)", LOCK_KEYS)
    except psycopg.Error:
        pass


def migrate_up(conn: psycopg.Connection, migrations: list[Migration]) -> list[str]:
    _lock(conn)
    try:
        done = applied_versions(conn)
        by_version = {m.version: m for m in migrations}
        unknown = set(done) - set(by_version)
        if unknown:
            raise MigrationError(
                f"applied version(s) not in repository: {', '.join(sorted(unknown))}"
            )
        applied_now: list[str] = []
        for m in migrations:
            if m.version in done:
                if done[m.version][1] != m.checksum:
                    raise MigrationError(f"checksum changed for applied version {m.version}")
                continue
            with conn.transaction():
                conn.execute(m.up_sql)
                conn.execute(
                    "INSERT INTO schema_migrations (version, name, checksum) VALUES (%s, %s, %s)",
                    (m.version, m.name, m.checksum),
                )
            applied_now.append(m.version)
        return applied_now
    finally:
        _unlock(conn)


def migrate_down(conn: psycopg.Connection, migrations: list[Migration], steps: int) -> list[str]:
    if steps < 1:
        raise MigrationError("steps must be >= 1")
    _lock(conn)
    try:
        by_version = {m.version: m for m in migrations}
        done = sorted(applied_versions(conn), reverse=True)[:steps]
        reverted: list[str] = []
        for version in done:
            if version not in by_version:
                raise MigrationError(f"applied version {version} is not in the repository")
            with conn.transaction():
                conn.execute(by_version[version].down_sql)
                conn.execute("DELETE FROM schema_migrations WHERE version = %s", (version,))
            reverted.append(version)
        return reverted
    finally:
        _unlock(conn)


def check(conn: psycopg.Connection, migrations: list[Migration]) -> list[str]:
    """Return a list of problems. An empty list means the database matches the repository."""
    done = applied_versions(conn, create=False)
    by_version = {m.version: m for m in migrations}
    problems: list[str] = []
    for v, (_, checksum) in done.items():
        if v not in by_version:
            problems.append(f"version {v} applied but not in repository")
        elif by_version[v].checksum != checksum:
            problems.append(f"checksum mismatch for version {v}")
    for m in migrations:
        if m.version not in done:
            problems.append(f"version {m.version} ({m.name}) is pending")
    return problems


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("status", "up", "check", "verify", "report"):
        sub.add_parser(name)
    d = sub.add_parser("down")
    d.add_argument("--steps", type=positive_int, default=1)
    d.add_argument("--yes", action="store_true", help="confirm that data will be dropped")
    args = p.parse_args(argv)

    if args.cmd == "down" and not args.yes:
        print("refusing: down drops tables and data. Re-run with --yes.", file=sys.stderr)
        return 2

    try:
        migrations = load_migrations()
        with connect() as conn:
            host = conn.info.host
            print(
                f"target: host={host} db={conn.info.dbname} user={conn.info.user}",
                file=sys.stderr if args.cmd == "report" else sys.stdout,
            )
            if args.cmd == "status":
                done = applied_versions(conn, create=False)
                for m in migrations:
                    print(f"{m.version} {m.name:28} {'applied' if m.version in done else 'pending'}")
                return 0
            if args.cmd == "up":
                applied = migrate_up(conn, migrations)
                print("applied:", ", ".join(applied) if applied else "nothing to do")
                return 0
            if args.cmd == "down":
                print("reverted:", ", ".join(migrate_down(conn, migrations, args.steps)) or "nothing")
                return 0
            if args.cmd == "check":
                problems = check(conn, migrations)
                for pr in problems:
                    print("PROBLEM:", pr)
                if not problems:
                    print("ok: database matches repository")
                    return 0
                return 2 if any("pending" not in x for x in problems) else 1
            if args.cmd == "verify":
                import verify

                problems = verify.verify(conn, migrations)
                for pr in problems:
                    print("PROBLEM:", pr)
                print("ok: schema verified" if not problems else f"{len(problems)} problem(s)")
                return 1 if problems else 0
            if args.cmd == "report":
                import report

                print(json.dumps(report.build_report(conn), indent=2, sort_keys=True))
                return 0
    except MigrationError as e:
        print(f"ERROR: {' '.join(str(e).split())}", file=sys.stderr)
        return 3
    except psycopg.Error as e:
        print(f"ERROR: {' '.join(str(e).split())}", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
