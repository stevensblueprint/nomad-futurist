"""Run the Nomad database migrations from inside the VPC.

Invoke with one of:
  {"action": "status"}
  {"action": "up"}
  {"action": "check"}
  {"action": "verify"}
  {"action": "integrity"}     run the constraint tests; every test is rolled back
  {"action": "down", "steps": N, "confirm": "drop-data"}   revert the newest N versions

The database credentials come from the Secrets Manager secret named in the
DB_SECRET_NAME environment variable. They are never logged or returned.
"""
from __future__ import annotations

import contextlib
import io
import json
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
SIMPLE_ACTIONS = ("status", "up", "check", "verify")
ALL_ACTIONS = SIMPLE_ACTIONS + ("down", "integrity")
REQUIRED_SECRET_KEYS = ("username", "password", "host")


def handler(event: dict[str, Any] | None, context: Any) -> dict[str, Any]:
    event = event or {}
    action = event.get("action")
    if action not in ALL_ACTIONS:
        return _result(2, f"unknown action {action!r}; use one of: {', '.join(ALL_ACTIONS)}")

    steps = 1
    if action == "down":
        steps = event.get("steps", 1)
        valid_steps = isinstance(steps, int) and not isinstance(steps, bool) and steps >= 1
        if event.get("confirm") != "drop-data" or not valid_steps:
            return _result(2, 'down needs "confirm": "drop-data" and an integer "steps" >= 1')

    try:
        secret = _load_secret()
    except Exception as exc:  # no details: they could contain secret names or values
        return _result(3, f"could not read the database secret: {type(exc).__name__}")

    _configure_environment(secret)
    if action == "integrity":
        code, output = _run_integrity(secret)
    elif action == "down":
        code, output = _run_migrate(["down", "--steps", str(steps), "--yes"])
    else:
        code, output = _run_migrate([action])
    return _result(code, output.replace(str(secret["password"]), "***"))


def _load_secret() -> dict[str, Any]:
    import boto3

    raw = boto3.client("secretsmanager").get_secret_value(SecretId=os.environ["DB_SECRET_NAME"])
    secret = json.loads(raw["SecretString"])
    missing = [key for key in REQUIRED_SECRET_KEYS if not secret.get(key)]
    if missing:
        raise ValueError(f"secret is missing keys: {', '.join(missing)}")
    secret.setdefault("port", 5432)
    secret.setdefault("dbname", "postgres")
    return secret


def _sslmode() -> str:
    return os.environ.get("DB_SSLMODE", "verify-full")


def _configure_environment(secret: dict[str, Any]) -> None:
    os.environ["PGHOST"] = str(secret["host"])
    os.environ["PGPORT"] = str(secret["port"])
    os.environ["PGUSER"] = str(secret["username"])
    os.environ["PGPASSWORD"] = str(secret["password"])
    os.environ["PGDATABASE"] = str(secret["dbname"])
    os.environ["PGSSLMODE"] = _sslmode()
    os.environ["PGSSLROOTCERT"] = str(CA_BUNDLE)


def _run_migrate(argv: list[str]) -> tuple[int, str]:
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            code = migrate.main(argv)
    except (Exception, SystemExit) as exc:
        return 3, out.getvalue() + f"ERROR: {type(exc).__name__}"
    return int(code or 0), out.getvalue()


def _run_integrity(secret: dict[str, Any]) -> tuple[int, str]:
    import pytest

    # The password is not in this string: libpq reads it from PGPASSWORD.
    os.environ["INTEGRITY_TARGET_DSN"] = (
        f"host={secret['host']} port={secret['port']} dbname={secret['dbname']} "
        f"user={secret['username']} sslmode={_sslmode()} sslrootcert={CA_BUNDLE}"
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
