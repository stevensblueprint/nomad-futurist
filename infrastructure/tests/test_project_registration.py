import base64
import importlib.util
import json
import pathlib
import unittest
import uuid
from unittest.mock import patch


MODULE_PATH = pathlib.Path(__file__).parents[1] / "functions" / "registration-lambda" / "main.py"
SPEC = importlib.util.spec_from_file_location("registration_lambda", MODULE_PATH)
registration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(registration)


class ProjectRegistrationTest(unittest.TestCase):
    def setUp(self):
        self.payload = {
            "projectName": "  Example Project ",
            "description": " Technical training ",
            "linkedInUrl": "https://example.org/project",
            "supportType": "both",
            "needs": " Mentorship ",
            "fundingRange": {"minimum": 10000, "maximum": 50000},
            "visionDocument": None,
        }

    @staticmethod
    def event(payload=None, groups="Founders", **overrides):
        event = {
            "httpMethod": "POST",
            "resource": "/projects",
            "requestContext": {"authorizer": {"claims": {"cognito:groups": groups}}},
            "body": json.dumps(payload) if payload is not None else None,
        }
        event.update(overrides)
        return event

    @staticmethod
    def body(response):
        return json.loads(response["body"])

    def create(self, payload=None, **overrides):
        return registration.handler(self.event(self.payload if payload is None else payload, **overrides), None)

    def test_valid_request_returns_normalized_draft_with_uuid_and_cors(self):
        response = self.create()
        body = self.body(response)
        self.assertEqual(response["statusCode"], 201)
        self.assertEqual(body["projectName"], "Example Project")
        self.assertEqual(body["description"], "Technical training")
        self.assertEqual(body["needs"], "Mentorship")
        self.assertEqual(body["fundingRange"], {"minimum": 10000, "maximum": 50000})
        self.assertEqual(body["status"], "draft")
        self.assertEqual(body["visionDocument"], None)
        self.assertEqual(body["linkedInUrl"], "https://example.org/project")
        self.assertEqual(str(uuid.UUID(body["projectId"])), body["projectId"])
        self.assertEqual(response["headers"]["Access-Control-Allow-Origin"], "http://localhost:3000")
        self.assertIn("Authorization", response["headers"]["Access-Control-Allow-Headers"])

    def test_generated_ids_are_unique_across_requests(self):
        first = self.body(self.create())["projectId"]
        second = self.body(self.create())["projectId"]
        self.assertNotEqual(first, second)

    @patch.object(registration.uuid, "uuid4", side_effect=RuntimeError("injected failure"))
    def test_unexpected_failure_returns_safe_500_with_cors(self, _uuid4):
        with self.assertLogs(registration.LOGGER, level="ERROR"):
            response = self.create()
        self.assertEqual(response["statusCode"], 500)
        self.assertEqual(self.body(response), {"message": "Unable to process the registration request."})
        self.assertEqual(response["headers"]["Access-Control-Allow-Origin"], "http://localhost:3000")

    def test_all_support_types_and_human_capital_null_funding(self):
        for support_type in ("funding", "human_capital", "both"):
            with self.subTest(support_type=support_type):
                payload = dict(self.payload, supportType=support_type)
                if support_type == "human_capital":
                    payload["fundingRange"] = None
                self.assertEqual(self.body(self.create(payload))["fundingRange"], payload["fundingRange"])

    def test_omitted_optional_url_and_vision_normalize_to_null(self):
        payload = dict(self.payload)
        del payload["linkedInUrl"]
        del payload["visionDocument"]
        body = self.body(self.create(payload))
        self.assertEqual(body["linkedInUrl"], None)
        self.assertEqual(body["visionDocument"], None)

    def test_base64_encoded_body_is_decoded(self):
        raw = json.dumps(self.payload).encode()
        response = registration.handler(self.event(None, body=base64.b64encode(raw).decode(), isBase64Encoded=True), None)
        self.assertEqual(response["statusCode"], 201)

    def test_missing_malformed_and_non_object_bodies_return_400(self):
        for body in (None, "", "{", "[]", '"text"', "null", "42"):
            with self.subTest(body=body):
                response = registration.handler(self.event(None, body=body), None)
                self.assertEqual(response["statusCode"], 400)

    def test_invalid_base64_returns_400(self):
        response = registration.handler(self.event(None, body="%%%", isBase64Encoded=True), None)
        self.assertEqual(response["statusCode"], 400)

    def test_base64_body_with_invalid_utf8_returns_400(self):
        response = registration.handler(self.event(None, body="/w==", isBase64Encoded=True), None)
        self.assertEqual(response["statusCode"], 400)

    def test_required_strings_are_trimmed_and_validated(self):
        for field in ("projectName", "description", "needs"):
            for value in (None, "", "  ", 12, [], {}):
                payload = dict(self.payload, **{field: value})
                response = self.create(payload)
                self.assertEqual(response["statusCode"], 400, (field, value))
                self.assertIn(field, self.body(response)["errors"])

    def test_invalid_support_type_is_rejected(self):
        for value in ("other", None, [], {}, 1, True):
            with self.subTest(value=value):
                self.assertEqual(self.create(dict(self.payload, supportType=value))["statusCode"], 400)

    def test_url_must_be_absolute_http_or_https(self):
        for value in (
            "ftp://example.org", "//example.org/a", "example.org", "https:///missing-host",
            "https://:bad", "https://bad host.example/path", "https://bad\\\\host.example/path",
        ):
            with self.subTest(value=value):
                response = self.create(dict(self.payload, linkedInUrl=value))
                self.assertEqual(response["statusCode"], 400)
                self.assertIn("linkedInUrl", self.body(response)["errors"])

    def test_nonstring_url_types_are_rejected(self):
        for value in (0, False, [], {}):
            with self.subTest(value=value):
                response = self.create(dict(self.payload, linkedInUrl=value))
                self.assertEqual(response["statusCode"], 400)
                self.assertIn("linkedInUrl", self.body(response)["errors"])

    def test_absolute_url_with_path_and_query_is_preserved(self):
        value = "https://example.org/projects/current?source=founder"
        response = self.create(dict(self.payload, linkedInUrl=value))
        self.assertEqual(response["statusCode"], 201)
        self.assertEqual(self.body(response)["linkedInUrl"], value)

    def test_empty_url_normalizes_to_null(self):
        self.assertIsNone(self.body(self.create(dict(self.payload, linkedInUrl="  ")))["linkedInUrl"])

    def test_funding_bounds_reject_missing_wrong_type_boolean_negative_nonfinite_and_reverse(self):
        invalid = (
            {}, {"minimum": 1}, {"minimum": "1", "maximum": 2},
            {"minimum": True, "maximum": 2}, {"minimum": -1, "maximum": 2},
            {"minimum": float("nan"), "maximum": 2},
            {"minimum": float("inf"), "maximum": 2},
            {"minimum": 10**400, "maximum": 10**400},
            {"minimum": 1, "maximum": 2, "currency": "USD"},
            {"minimum": 3, "maximum": 2},
        )
        for funding in invalid:
            with self.subTest(funding=funding):
                response = self.create(dict(self.payload, fundingRange=funding))
                self.assertEqual(response["statusCode"], 400)

    def test_funding_bounds_accept_equal_and_zero(self):
        response = self.create(dict(self.payload, fundingRange={"minimum": 0, "maximum": 0}))
        self.assertEqual(response["statusCode"], 201)

    def test_missing_funding_is_rejected_for_funding_support(self):
        payload = dict(self.payload, supportType="funding")
        del payload["fundingRange"]
        self.assertEqual(self.create(payload)["statusCode"], 400)

    def test_human_capital_requires_null_or_omitted_funding(self):
        payload = dict(self.payload, supportType="human_capital", fundingRange={"minimum": 1, "maximum": 2})
        self.assertEqual(self.create(payload)["statusCode"], 400)

    def test_unknown_and_backend_controlled_fields_are_rejected(self):
        for field in ("unexpected", "projectId", "founderId", "userId", "status", "validationState", "reviewer", "validationNotes"):
            with self.subTest(field=field):
                response = self.create(dict(self.payload, **{field: "forbidden"}))
                self.assertEqual(response["statusCode"], 400)
                self.assertIn(field, self.body(response)["errors"])

    def test_vision_document_payload_is_rejected(self):
        self.assertEqual(self.create(dict(self.payload, visionDocument={"key": "x"}))["statusCode"], 400)

    def test_missing_claims_return_401(self):
        for context in ({}, {"authorizer": {}}, {"authorizer": {"claims": None}}):
            event = self.event()
            event["requestContext"] = context
            self.assertEqual(registration.handler(event, None)["statusCode"], 401)

    def test_non_founder_or_malformed_group_claims_return_403(self):
        for groups in (None, "Mentors", "Foundersx", '["Mentors"]', "[broken", 1):
            with self.subTest(groups=groups):
                response = self.create(groups=groups)
                self.assertEqual(response["statusCode"], 403)

    def test_founder_group_claim_accepts_rest_representations(self):
        for groups in (["Mentors", "Founders"], "Mentors, Founders", '["Mentors", "Founders"]'):
            with self.subTest(groups=groups):
                self.assertEqual(self.create(groups=groups)["statusCode"], 201)

    def test_supported_route_stubs_remain_and_unknown_routes_are_404(self):
        supported = (
            ("GET", "/projects"), ("GET", "/projects/{projectId}"),
            ("PATCH", "/projects/{projectId}"), ("POST", "/projects/{projectId}/submit"),
        )
        for method, resource in supported:
            response = registration.handler({"httpMethod": method, "resource": resource}, None)
            self.assertEqual(response["statusCode"], 200)
        for method, resource in (("DELETE", "/projects"), ("GET", "/unknown"), ("POST", "/projects/{projectId}")):
            response = registration.handler({"httpMethod": method, "resource": resource}, None)
            self.assertEqual(response["statusCode"], 404)


if __name__ == "__main__":
    unittest.main()
