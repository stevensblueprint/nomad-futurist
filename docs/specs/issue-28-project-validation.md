# Issue #28: Minimal Project Validation Form and Request Handling

## Problem Statement

Reviewers need a small validation form that proves validation data can travel from the browser through API Gateway to the Project Validation Lambda and back. The current validation route is connected to the Lambda, but the Lambda only returns generic route metadata and no validation form exists.

## Solution

Provide a client-side Project Validation page for a project identifier. It collects a validation decision, reviewer feedback, questions, and next steps; submits those values as JSON to the deployed validation endpoint; and makes the request lifecycle visible to the reviewer.

The Project Validation Lambda will handle the `PATCH` request as a transport-only operation: extract the path project identifier, parse and validate the request body, then return the submitted object. It will not persist or mutate project data.

The browser obtains the API base URL from `NEXT_PUBLIC_PROJECT_API_URL`. The current development value is the deployed API Gateway `dev` URL, without a trailing slash:

```text
https://xriiolra04.execute-api.us-east-1.amazonaws.com/dev
```

## User Stories

1. As a reviewer, I want to open a validation page for a project, so that I can enter my review outcome in one place.
2. As a reviewer, I want to enter a decision, feedback, questions, and next steps, so that my complete validation context is sent together.
3. As a reviewer, I want visible submitting, success, and failure states, so that I know whether the request reached the validation service.
4. As an API consumer, I want the validation endpoint to return the project identifier and submitted object, so that I can verify the end-to-end request contract.
5. As an operator, I want malformed or non-object request bodies rejected, so that the endpoint has a stable JSON contract.
6. As the project, I want this validation slice to remain non-persistent, so that it does not prematurely introduce database, RDS, project-status, or identity behavior.

## Implementation Decisions

- Create a dynamic validation page for `/validation/projects/[projectId]`. It is a client component because it owns editable form state and the submission lifecycle.
- The form payload has four string fields: `decision`, `feedback`, `questions`, and `nextSteps`. The request uses `PATCH`, `Content-Type: application/json`, and the route's `projectId`.
- Build the request URL from `NEXT_PUBLIC_PROJECT_API_URL` and normalize the base URL so exactly one slash separates it from `validation/projects/{projectId}`.
- Treat only a successful HTTP response as success. While the request is pending, disable repeated submission and expose a loading state. Surface a human-readable error for network failures and non-success responses; show a success state only after a successful response.
- Follow the existing authentication-form styling standard: a colocated CSS module using the global foreground/background variables, a centered narrow content column, labelled fields with visible focus outlines, full-width controls, responsive dark-mode colors, and `aria-live` status/error messaging. Use a textarea where long-form reviewer input is appropriate.
- Update the Project Validation Lambda only for `PATCH /validation/projects/{projectId}`. It reads `pathParameters.projectId`, parses the raw body with JSON, rejects parse failures and JSON values other than objects with `400`, and returns `200` with `{ projectId, validation }` for an object body.
- Preserve the existing validation and registration routes. API Gateway already connects the requested PATCH route to the Validation Lambda, so this work does not add a route, database, IAM/RDS permission, or storage layer.

## Testing Decisions

Tests verify observable behavior at three seams, not internal implementation details.

- **Validation Lambda contract seam:** invoke the handler with API Gateway-shaped events. Cover a successful PATCH echo, project-ID extraction, malformed JSON, and JSON arrays/scalars rejected as non-objects. This is the primary proof of the request/response contract.
- **Frontend form seam:** use a browser-like component test for user input and a mocked HTTP boundary. Cover JSON request method/body/URL, pending submission, successful response, non-success response, and rejected network request. The frontend currently has no test harness, so add the smallest compatible test setup needed for this page.
- **API Gateway infrastructure seam:** extend the existing CDK template testing style to assert the validation project-ID resource has a PATCH method whose integration targets the Validation Lambda. This guards the existing route wiring without depending on a live deployment.
- Run the relevant frontend checks, Lambda tests, and CDK tests. An optional deployed smoke request may demonstrate the complete diagram, but it is not the only acceptance proof.

## Acceptance Criteria Mapping

| Issue acceptance criterion | Planned evidence |
| --- | --- |
| Minimal Project Validation page is implemented. | Dynamic validation page renders for a project ID. |
| Validation form collects the required fields. | Form exposes decision, feedback, questions, and next-steps controls. |
| Frontend submits the form to `PATCH /validation/projects/{projectId}`. | Frontend form test asserts method, URL, headers, and JSON body. |
| API Gateway successfully invokes the Project Validation Lambda. | Existing integration is protected by a CDK template assertion; optional deployed smoke test verifies the live path. |
| Lambda retrieves `projectId` from the path. | Lambda contract test asserts the echoed project ID comes from path parameters. |
| Lambda parses the JSON request body. | Lambda contract test sends a valid object and asserts the echoed object. |
| Lambda returns the submitted validation data. | Lambda contract test asserts the full response contract. |
| Malformed JSON returns `400`. | Lambda contract test sends malformed JSON and asserts `400`. |
| Frontend displays loading, success, and error states. | Frontend behavior tests assert each state. |
| No PostgreSQL persistence is implemented. | Implementation review confirms the handler performs no database operation. |
| No temporary in-memory project store is introduced. | Implementation review confirms the handler echoes only the current request. |
| No RDS permissions are added. | CDK diff and construct review show no IAM/RDS permission additions. |
| Existing Project Registration and Validation routes remain operational. | Existing route definitions are preserved; CDK template tests cover the validation PATCH route. |

## Out of Scope

- PostgreSQL or any other persistence.
- Reading real projects, reviewer identity, authorization, validation-status persistence, or project-status updates.
- S3 integration, notifications, and workflow automation.
- New API Gateway routes, temporary stores, or RDS permissions.

## Further Notes

The PR description should include one example request and its matching response, and show this request path:

```text
Validation Form → PATCH /validation/projects/{projectId} → API Gateway → Project Validation Lambda → parse body → 200 response
```

This specification is local only. It must not be published, commented on, or reflected in GitHub labels.
