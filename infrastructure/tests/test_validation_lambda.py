import json
import importlib.util
from pathlib import Path
import unittest


_MODULE_PATH = Path(__file__).parent.parent / "functions" / "validation" / "main.py"
_SPEC = importlib.util.spec_from_file_location("validation_lambda", _MODULE_PATH)
assert _SPEC and _SPEC.loader
_MODULE = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)
handler = _MODULE.handler


class ValidationLambdaTest(unittest.TestCase):
    @staticmethod
    def event(
        body: str,
        project_id: str = "project-123",
        method: str = "PATCH",
        groups: object = "TechnicalStaff",
    ) -> dict[str, object]:
        return {
            "httpMethod": method,
            "resource": "/validation/projects/{projectId}",
            "pathParameters": {"projectId": project_id},
            "body": body,
            "requestContext": {"authorizer": {"claims": {"cognito:groups": groups}}},
        }

    def test_all_validation_routes_require_an_allowed_group(self) -> None:
        routes = (
            ("GET", "/validation/projects"),
            ("GET", "/validation/projects/{projectId}"),
            ("POST", "/validation/projects/{projectId}"),
            ("PATCH", "/validation/projects/{projectId}"),
        )
        for groups in (
            "TechnicalStaff", "Mentors", "Founders,TechnicalStaff",
            '["Admin", "Mentors"]', "[Admin, TechnicalStaff]",
            "[Mentors, Founders]",
        ):
            for method, resource in routes:
                with self.subTest(groups=groups, method=method, resource=resource):
                    event = self.event('{"decision":"approved"}', project_id="project-456", method=method, groups=groups)
                    event["resource"] = resource
                    self.assertNotIn(handler(event, None)["statusCode"], (401, 403))

        for groups in ("Founders", "Admin", "Founders,Admin", "Other", "", None, '[broken'):
            for method, resource in routes:
                with self.subTest(groups=groups, method=method, resource=resource):
                    event = self.event('{"decision":"approved"}', method=method, groups=groups)
                    event["resource"] = resource
                    self.assertEqual(403, handler(event, None)["statusCode"])

    def test_missing_authorizer_claims_return_401(self) -> None:
        for request_context in (None, {}, {"authorizer": {}}, {"authorizer": {"claims": "bad"}}):
            with self.subTest(request_context=request_context):
                event = self.event('{"decision":"approved"}', method="POST")
                event["requestContext"] = request_context
                self.assertEqual(401, handler(event, None)["statusCode"])

    def test_validation_patch_updates_an_existing_mock_validation(self) -> None:
        validation = {
            "decision": "approved",
            "feedback": "Project appears feasible.",
            "questions": "What is the delivery date?",
            "nextSteps": "Proceed to review.",
        }

        result = handler(self.event(json.dumps(validation), project_id="project-456"), None)

        self.assertEqual(200, result["statusCode"])
        self.assertEqual(
            {"projectId": "project-456", "validation": validation},
            json.loads(result["body"]),
        )

    def test_validation_patch_rejects_a_project_without_a_mock_validation(self) -> None:
        result = handler(self.event(json.dumps({"decision": "approved"})), None)

        self.assertEqual(404, result["statusCode"])
        self.assertEqual(
            {"message": "Validation report not found."},
            json.loads(result["body"]),
        )

    def test_validation_post_creates_a_mock_validation_for_a_known_project(self) -> None:
        validation = {"decision": "approved"}

        result = handler(self.event(json.dumps(validation), method="POST"), None)

        self.assertEqual(201, result["statusCode"])
        self.assertEqual(
            {
                "projectId": "project-123",
                "validation": validation,
                "action": "created",
            },
            json.loads(result["body"]),
        )

    def test_validation_post_rejects_existing_report(self):
        validation = {"decision": "needs-changes"}

        result = handler(
            self.event(
                json.dumps(validation),
                project_id="project-456",
                method="POST",
            ),
            None,
        )

        self.assertEqual(409, result["statusCode"])
        self.assertEqual(
            {"message": "Validation report already exists."},
            json.loads(result["body"]),
        )

    def test_validation_post_rejects_an_unknown_mock_project(self) -> None:
        result = handler(
            self.event(
                json.dumps({"decision": "approved"}),
                project_id="missing",
                method="POST",
            ),
            None,
        )

        self.assertEqual(404, result["statusCode"])
        self.assertEqual(
            {"message": "Project not found."},
            json.loads(result["body"]),
        )

    def test_validation_post_rejects_malformed_and_non_object_json(self) -> None:
        for body in ("{", "[]", '"not an object"', "123", "true", "null"):
            with self.subTest(body=body):
                result = handler(self.event(body, method="POST"), None)

                self.assertEqual(400, result["statusCode"])
                self.assertEqual(
                    {"message": "Request body must be a JSON object."},
                    json.loads(result["body"]),
                )

    def test_validation_patch_rejects_malformed_json(self) -> None:
        result = handler(self.event("{"), None)

        self.assertEqual(400, result["statusCode"])
        self.assertEqual(
            {"message": "Request body must be a JSON object."},
            json.loads(result["body"]),
        )

    def test_validation_patch_rejects_non_object_json(self) -> None:
        for body in ("[]", '"not an object"', "123", "true", "null"):
            with self.subTest(body=body):
                result = handler(self.event(body), None)

                self.assertEqual(400, result["statusCode"])
                self.assertEqual(
                    {"message": "Request body must be a JSON object."},
                    json.loads(result["body"]),
                )


if __name__ == "__main__":
    unittest.main()
