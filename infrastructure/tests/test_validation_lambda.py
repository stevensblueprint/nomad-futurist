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
    def event(body: str, project_id: str = "project-123") -> dict[str, object]:
        return {
            "httpMethod": "PATCH",
            "resource": "/validation/projects/{projectId}",
            "pathParameters": {"projectId": project_id},
            "body": body,
        }

    def test_validation_patch_echoes_the_project_id_and_submitted_object(self) -> None:
        validation = {
            "decision": "approved",
            "feedback": "Project appears feasible.",
            "questions": "What is the delivery date?",
            "nextSteps": "Proceed to review.",
        }

        result = handler(self.event(json.dumps(validation)), None)

        self.assertEqual(200, result["statusCode"])
        self.assertEqual(
            {"projectId": "project-123", "validation": validation},
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
