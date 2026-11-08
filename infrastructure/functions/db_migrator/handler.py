"""Run the Nomad database migrations from inside the VPC.

Invoke with one of:
  {"action": "status", "password": "<db password>"}
  {"action": "up", "password": "<db password>"}
  {"action": "check", "password": "<db password>"}
  {"action": "verify", "password": "<db password>"}
  {"action": "report", "password": "<db password>"}      dump the schema as JSON (structure + hash)
  {"action": "integrity", "password": "<db password>"}     run the constraint tests; every test is rolled back
  {"action": "down", "steps": N, "confirm": "drop-data", "password": "<db password>"}   revert the newest N versions

The host, user, database, and port come from the DB_HOST, DB_USER, DB_NAME, and
DB_PORT environment variables set by CDK. The password is sent in the invoke
payload. It is never logged or returned.
"""
from __future__ import annotations

import contextlib
import io
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent


def _find(bundled: str, repo: tuple[str, ...]) -> Path:
    """The bundled path inside the Lambda package, or the repository path when run locally."""
    path = ROOT / bundled
    return path if path.exists() else ROOT.parents[2].joinpath(*repo)


MIGRATIONS_DIR = _find("migrations", ("backend", "migrations"))
TESTS_DIR = _find("tests", ("backend", "tests"))
sys.path.insert(0, str(MIGRATIONS_DIR))

import migrate  # noqa: E402

CA_BUNDLE = ROOT / "rds-global-bundle.crt"
SIMPLE_ACTIONS = ("status", "up", "check", "verify", "report")
ALL_ACTIONS = SIMPLE_ACTIONS + ("down", "integrity")


def handler(event: dict[str, Any] | None, context: Any) -> dict[str, Any]:
    event = event or {}
    action = event.get("action")
    if action not in ALL_ACTIONS:
        return _result(2, f"unknown action {action!r}; use one of: {', '.join(ALL_ACTIONS)}")

    steps = None
    if action == "down":
        steps = event.get("steps")
        valid_steps = isinstance(steps, int) and not isinstance(steps, bool) and steps >= 1
        if event.get("confirm") != "drop-data" or not valid_steps:
            return _result(2, 'down needs "confirm": "drop-data" and an integer "steps" >= 1')

    password = event.get("password")
    if not isinstance(password, str) or not password:
        return _result(2, 'a non-empty "password" string is required')

    missing = [name for name in ("DB_HOST", "DB_USER") if not os.environ.get(name)]
    if missing:
        return _result(3, "missing configuration: " + ", ".join(missing))

    _configure_environment(password)
    try:
        if action == "integrity":
            code, output = _run_integrity()
        elif action == "down":
            code, output = _run_migrate(["down", "--steps", str(steps), "--yes"])
        elif action == "report":
            # The report writes only JSON to stdout; the "target:" line goes to
            # stderr. Drop stderr so the output is pure JSON (parseable with jq).
            code, output = _run_migrate(["report"], drop_stderr=True)
        else:
            code, output = _run_migrate([action])
    finally:
        os.environ.pop("PGPASSWORD", None)
    return _result(code, output.replace(password, "***"))


def _sslmode() -> str:
    return os.environ.get("DB_SSLMODE", "verify-full")


def _configure_environment(password: str) -> None:
    os.environ["PGHOST"] = os.environ["DB_HOST"]
    os.environ["PGPORT"] = os.environ.get("DB_PORT", "5432")
    os.environ["PGUSER"] = os.environ["DB_USER"]
    os.environ["PGPASSWORD"] = password
    os.environ["PGDATABASE"] = os.environ.get("DB_NAME", "postgres")
    os.environ["PGSSLMODE"] = _sslmode()
    os.environ["PGSSLROOTCERT"] = str(CA_BUNDLE)


def _run_migrate(argv: list[str], *, drop_stderr: bool = False) -> tuple[int, str]:
    out = io.StringIO()
    err = io.StringIO()
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = migrate.main(argv)
    except (Exception, SystemExit) as exc:
        return 3, out.getvalue() + f"ERROR: {type(exc).__name__}"
    output = out.getvalue() if drop_stderr else out.getvalue() + err.getvalue()
    return int(code or 0), output


def _run_integrity() -> tuple[int, str]:
    import pytest

    # The password is not in this string: libpq reads it from PGPASSWORD.
    os.environ["INTEGRITY_TARGET_DSN"] = (
        f"host={os.environ['DB_HOST']} port={os.environ.get('DB_PORT', '5432')} "
        f"dbname={os.environ.get('DB_NAME', 'postgres')} user={os.environ['DB_USER']} "
        f"sslmode={_sslmode()} sslrootcert={CA_BUNDLE}"
    )
    os.environ["TEST_DATABASE_URL"] = "unused"  # only the fixtures that create databases use it
    out = io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
        code = pytest.main(
            [
                "-q",
                "-p", "no:cacheprovider",
                "--tb=short",
                "-k", "not round_trip",
                str(TESTS_DIR / "db" / "test_integrity.py"),
            ]
        )
    return int(code), out.getvalue()


def _result(code: int, output: str) -> dict[str, Any]:
    return {"exitCode": code, "ok": code == 0, "output": output}
