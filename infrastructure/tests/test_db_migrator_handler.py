import importlib
import json
import os
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

HANDLER_DIR = Path(__file__).resolve().parent.parent / "functions" / "db_migrator"
SECRET = {
    "username": "nomad",
    "password": "s3cr3t-value",
    "host": "db.example.internal",
    "port": 5432,
    "dbname": "postgres",
}


def load_handler(main):
    """Import handler.py with a fake `migrate` module, so psycopg is not needed."""
    fake = types.SimpleNamespace(main=main)
    sys.modules["migrate"] = fake
    sys.path.insert(0, str(HANDLER_DIR))
    sys.modules.pop("handler", None)
    module = importlib.import_module("handler")
    return module


class HandlerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.calls = []
        self.printed = "applied: 0001\n"

        def fake_main(argv):
            self.calls.append(argv)
            print(self.printed, end="")
            return 0

        self.handler = load_handler(fake_main)
        self.handler._load_secret = lambda: dict(SECRET)
        self.env = mock.patch.dict(os.environ, {}, clear=False)
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_unknown_action_is_rejected(self) -> None:
        result = self.handler.handler({"action": "drop_everything"}, None)
        self.assertEqual(2, result["exitCode"])
        self.assertFalse(result["ok"])
        self.assertEqual([], self.calls)

    def test_missing_action_is_rejected(self) -> None:
        self.assertEqual(2, self.handler.handler({}, None)["exitCode"])
        self.assertEqual(2, self.handler.handler(None, None)["exitCode"])

    def test_up_calls_the_runner_and_sets_tls_environment(self) -> None:
        result = self.handler.handler({"action": "up"}, None)
        self.assertEqual([["up"]], self.calls)
        self.assertEqual(0, result["exitCode"])
        self.assertTrue(result["ok"])
        self.assertIn("applied: 0001", result["output"])
        self.assertEqual("db.example.internal", os.environ["PGHOST"])
        self.assertEqual("5432", os.environ["PGPORT"])
        self.assertEqual("nomad", os.environ["PGUSER"])
        self.assertEqual("postgres", os.environ["PGDATABASE"])
        self.assertEqual("verify-full", os.environ["PGSSLMODE"])
        self.assertTrue(os.environ["PGSSLROOTCERT"].endswith("rds-global-bundle.crt"))

    def test_each_simple_action_maps_to_the_runner_command(self) -> None:
        for action in ("status", "check", "verify"):
            self.calls.clear()
            self.handler.handler({"action": action}, None)
            self.assertEqual([[action]], self.calls)

    def test_down_needs_confirmation_and_valid_steps(self) -> None:
        for event in (
            {"action": "down"},
            {"action": "down", "steps": 1},
            {"action": "down", "steps": 1, "confirm": "yes"},
            {"action": "down", "steps": 0, "confirm": "drop-data"},
            {"action": "down", "steps": "2", "confirm": "drop-data"},
            {"action": "down", "steps": True, "confirm": "drop-data"},
        ):
            self.assertEqual(2, self.handler.handler(event, None)["exitCode"], event)
        self.assertEqual([], self.calls)

    def test_down_with_confirmation_passes_steps(self) -> None:
        self.handler.handler({"action": "down", "steps": 2, "confirm": "drop-data"}, None)
        self.assertEqual([["down", "--steps", "2", "--yes"]], self.calls)

    def test_password_is_removed_from_output(self) -> None:
        self.printed = f"connected with {SECRET['password']}\n"
        result = self.handler.handler({"action": "status"}, None)
        self.assertNotIn(SECRET["password"], json.dumps(result))
        self.assertIn("***", result["output"])

    def test_secret_failure_returns_exit_code_3_without_details(self) -> None:
        def broken():
            raise RuntimeError("AccessDenied for secret nomad/db-migration")

        self.handler._load_secret = broken
        result = self.handler.handler({"action": "up"}, None)
        self.assertEqual(3, result["exitCode"])
        self.assertIn("RuntimeError", result["output"])
        self.assertNotIn("nomad/db-migration", result["output"])
        self.assertEqual([], self.calls)

    def test_runner_exception_returns_exit_code_3(self) -> None:
        def boom(argv):
            raise ValueError("bad")

        self.handler.migrate.main = boom
        result = self.handler.handler({"action": "up"}, None)
        self.assertEqual(3, result["exitCode"])

    def test_sslmode_can_be_overridden_for_local_testing(self) -> None:
        with mock.patch.dict(os.environ, {"DB_SSLMODE": "disable"}):
            self.handler.handler({"action": "status"}, None)
            self.assertEqual("disable", os.environ["PGSSLMODE"])

    def test_integrity_action_uses_the_integrity_runner(self) -> None:
        self.handler._run_integrity = lambda secret: (0, "45 passed")
        result = self.handler.handler({"action": "integrity"}, None)
        self.assertEqual("45 passed", result["output"])
        self.assertEqual([], self.calls)

    def test_load_secret_parses_json_and_applies_defaults(self) -> None:
        handler = load_handler(lambda argv: 0)
        fake_boto3 = types.SimpleNamespace(
            client=lambda name: types.SimpleNamespace(
                get_secret_value=lambda SecretId: {
                    "SecretString": json.dumps(
                        {"username": "u", "password": "p", "host": "h"}
                    )
                }
            )
        )
        with mock.patch.dict(sys.modules, {"boto3": fake_boto3}), mock.patch.dict(
            os.environ, {"DB_SECRET_NAME": "nomad/db-migration"}
        ):
            secret = handler._load_secret()
        self.assertEqual(5432, secret["port"])
        self.assertEqual("postgres", secret["dbname"])

    def test_load_secret_rejects_missing_keys(self) -> None:
        handler = load_handler(lambda argv: 0)
        fake_boto3 = types.SimpleNamespace(
            client=lambda name: types.SimpleNamespace(
                get_secret_value=lambda SecretId: {"SecretString": json.dumps({"username": "u"})}
            )
        )
        with mock.patch.dict(sys.modules, {"boto3": fake_boto3}), mock.patch.dict(
            os.environ, {"DB_SECRET_NAME": "x"}
        ):
            with self.assertRaises(ValueError) as ctx:
                handler._load_secret()
        # The error names the missing keys and never prints secret values.
        self.assertIn("host", str(ctx.exception))
        self.assertIn("password", str(ctx.exception))
