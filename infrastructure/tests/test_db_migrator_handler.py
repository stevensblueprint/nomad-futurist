import importlib
import json
import os
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

HANDLER_DIR = Path(__file__).resolve().parent.parent / "functions" / "db_migrator"
PASSWORD = "s3cr3t-value"


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
        self.env = mock.patch.dict(
            os.environ,
            {"DB_HOST": "db.example.internal", "DB_USER": "nomad"},
            clear=False,
        )
        self.env.start()
        self.addCleanup(self.env.stop)

    def invoke(self, event):
        return self.handler.handler(event, None)

    def test_unknown_action_is_rejected(self) -> None:
        result = self.invoke({"action": "drop_everything", "password": PASSWORD})
        self.assertEqual(2, result["exitCode"])
        self.assertFalse(result["ok"])
        self.assertEqual([], self.calls)

    def test_missing_action_is_rejected(self) -> None:
        self.assertEqual(2, self.invoke({})["exitCode"])
        self.assertEqual(2, self.invoke(None)["exitCode"])
        self.assertEqual(2, self.invoke({"password": PASSWORD})["exitCode"])

    def test_up_calls_the_runner_and_sets_tls_environment(self) -> None:
        result = self.invoke({"action": "up", "password": PASSWORD})
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
        self.assertNotIn("PGPASSWORD", os.environ)

    def test_each_simple_action_maps_to_the_runner_command(self) -> None:
        for action in ("status", "check", "verify"):
            self.calls.clear()
            self.invoke({"action": action, "password": PASSWORD})
            self.assertEqual([[action]], self.calls)

    def test_down_needs_confirmation_and_valid_steps(self) -> None:
        for event in (
            {"action": "down"},
            {"action": "down", "confirm": "drop-data"},
            {"action": "down", "steps": 1},
            {"action": "down", "steps": 1, "confirm": "yes"},
            {"action": "down", "steps": 0, "confirm": "drop-data"},
            {"action": "down", "steps": "2", "confirm": "drop-data"},
            {"action": "down", "steps": True, "confirm": "drop-data"},
        ):
            self.assertEqual(2, self.invoke(event)["exitCode"], event)
        self.assertEqual([], self.calls)

    def test_down_with_confirmation_passes_steps(self) -> None:
        self.invoke({"action": "down", "steps": 2, "confirm": "drop-data", "password": PASSWORD})
        self.assertEqual([["down", "--steps", "2", "--yes"]], self.calls)

    def test_password_is_required(self) -> None:
        for event in ({"action": "up"}, {"action": "status"}):
            result = self.invoke(event)
            self.assertEqual(2, result["exitCode"], event)
            self.assertIn('a non-empty "password" string is required', result["output"])
        self.assertEqual([], self.calls)

    def test_password_must_be_a_non_empty_string(self) -> None:
        for value in (None, 123, True, ["x"]):
            result = self.invoke({"action": "up", "password": value})
            self.assertEqual(2, result["exitCode"], repr(value))
            self.assertNotIn(str(value), json.dumps(result))
        result = self.invoke({"action": "up", "password": ""})
        self.assertEqual(2, result["exitCode"])
        self.assertEqual([], self.calls)

    def test_event_cannot_override_connection_settings(self) -> None:
        self.invoke(
            {
                "action": "status",
                "password": PASSWORD,
                "host": "evil.example",
                "user": "evil",
                "dbname": "evil",
                "port": 9999,
            }
        )
        self.assertEqual("db.example.internal", os.environ["PGHOST"])
        self.assertEqual("5432", os.environ["PGPORT"])
        self.assertEqual("nomad", os.environ["PGUSER"])
        self.assertEqual("postgres", os.environ["PGDATABASE"])

    def test_missing_db_host_returns_3(self) -> None:
        with mock.patch.dict(os.environ, {"DB_HOST": ""}):
            result = self.invoke({"action": "up", "password": PASSWORD})
        self.assertEqual(3, result["exitCode"])
        self.assertIn("missing configuration: DB_HOST", result["output"])
        self.assertNotIn("DB_USER", result["output"])
        self.assertEqual([], self.calls)

    def test_missing_db_user_returns_3(self) -> None:
        with mock.patch.dict(os.environ, {"DB_USER": ""}):
            result = self.invoke({"action": "up", "password": PASSWORD})
        self.assertEqual(3, result["exitCode"])
        self.assertIn("missing configuration: DB_USER", result["output"])
        self.assertNotIn("DB_HOST", result["output"])
        self.assertEqual([], self.calls)

    def test_missing_both_returns_3_naming_both(self) -> None:
        with mock.patch.dict(os.environ, {"DB_HOST": "", "DB_USER": ""}):
            result = self.invoke({"action": "up", "password": PASSWORD})
        self.assertEqual(3, result["exitCode"])
        self.assertIn("DB_HOST", result["output"])
        self.assertIn("DB_USER", result["output"])
        self.assertEqual([], self.calls)

    def test_password_is_removed_from_output(self) -> None:
        self.printed = f"connected with {PASSWORD}\n"
        result = self.invoke({"action": "status", "password": PASSWORD})
        self.assertNotIn(PASSWORD, json.dumps(result))
        self.assertIn("***", result["output"])

    def test_pgpassword_is_removed_after_the_run(self) -> None:
        self.invoke({"action": "up", "password": PASSWORD})
        self.assertNotIn("PGPASSWORD", os.environ)

    def test_pgpassword_is_removed_after_an_exception(self) -> None:
        def boom(argv):
            raise RuntimeError("boom")

        self.handler._run_migrate = boom
        with self.assertRaises(RuntimeError):
            self.invoke({"action": "up", "password": PASSWORD})
        self.assertNotIn("PGPASSWORD", os.environ)

    def test_runner_exception_returns_exit_code_3(self) -> None:
        def boom(argv):
            raise ValueError("bad")

        self.handler.migrate.main = boom
        result = self.invoke({"action": "up", "password": PASSWORD})
        self.assertEqual(3, result["exitCode"])

    def test_sslmode_can_be_overridden_for_local_testing(self) -> None:
        with mock.patch.dict(os.environ, {"DB_SSLMODE": "disable"}):
            self.invoke({"action": "status", "password": PASSWORD})
            self.assertEqual("disable", os.environ["PGSSLMODE"])

    def test_integrity_action_uses_the_integrity_runner(self) -> None:
        self.handler._run_integrity = lambda: (0, "45 passed")
        result = self.invoke({"action": "integrity", "password": PASSWORD})
        self.assertEqual("45 passed", result["output"])
        self.assertEqual([], self.calls)

    def test_integrity_runs_both_constraint_and_section5_files(self) -> None:
        argv = []

        def fake_pytest_main(args):
            argv.extend(args)
            return 0

        with mock.patch.dict(sys.modules, {"pytest": types.SimpleNamespace(main=fake_pytest_main)}):
            code, output = self.handler._run_integrity()

        self.assertEqual(0, code, output)
        self.assertEqual("not round_trip", argv[argv.index("-k") + 1])
        files = [Path(arg).name for arg in argv if arg.endswith(".py")]
        self.assertEqual(["test_integrity.py", "test_section5.py"], files)

    def test_report_action_returns_pure_json(self) -> None:
        def fake_main(argv):
            self.calls.append(argv)
            print('{"hash": "abc", "schema": {}}', end="")
            print("target: noise", file=sys.stderr)
            return 0

        self.handler.migrate.main = fake_main
        result = self.invoke({"action": "report", "password": PASSWORD})
        self.assertEqual([["report"]], self.calls)
        self.assertEqual(0, result["exitCode"])
        self.assertTrue(result["ok"])
        # The "target:" line goes to stderr, which is dropped, so the output is
        # pure JSON that json.loads accepts.
        self.assertEqual({"hash": "abc", "schema": {}}, json.loads(result["output"]))

    def test_report_requires_password(self) -> None:
        result = self.invoke({"action": "report"})
        self.assertEqual(2, result["exitCode"])
        self.assertEqual([], self.calls)

    def test_env_defaults_for_port_and_dbname(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("DB_PORT", None)
            os.environ.pop("DB_NAME", None)
            self.invoke({"action": "status", "password": PASSWORD})
            self.assertEqual("5432", os.environ["PGPORT"])
            self.assertEqual("postgres", os.environ["PGDATABASE"])
