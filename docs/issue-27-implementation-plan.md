# Issue #27 implementation plan

Issue: [Implement Founder Project Registration Form and Request Processing](https://github.com/stevensblueprint/nomad-futurist/issues/27)

## Objective

Allow authenticated Founders to complete a minimal project registration form, submit JSON to `POST /projects`, and receive a normalized mock project response with `201 Created`. Keep the Founder on the form page and clearly explain that the request was processed but the project has not been persistently saved.

This plan has been implemented on `feat/issue-27-project-registration`. See [project-registration.md](project-registration.md) for the implemented contract, configuration, validation results, and remaining deployment checks. No PR was created.

## Agreed decisions

- Use `/register-project`. Do not add a `/registration` alias. The issue uses `/registration` in its workflow but `/register-project` in its acceptance criteria. Explain the choice in the PR and ask the issue author to confirm it.
- Require Cognito `Founders` membership to access the form and invoke `POST /projects`. Enforce access in the frontend and backend.
- Do not implement automatic Founder group assignment. The existing self-signup flow does not assign this group; assignment must be handled elsewhere. Explain this dependency and request clarification in the PR.
- Redirect users to `/` after completed sign-in. Show a plain "Register your project" button on the home page only for authenticated Founders.
- Require project name, description, support type, and requested assistance (`needs`). Keep the project/company URL optional.
- For `human_capital`, hide funding inputs and send `fundingRange: null`. For `funding` or `both`, require minimum and maximum funding values in USD. Accept finite, nonnegative numbers with minimum less than or equal to maximum.
- Show a vision-document placeholder and send `visionDocument: null`. Do not implement upload or storage.

## Scope boundaries

Do not add PostgreSQL operations, an in-memory project database, RDS permissions, S3 integration, Founder-to-project persistence, project lookup, dashboard navigation, validation processing, mentor assignment, or funding decisions. Do not add Cognito administrative permissions to the registration Lambda. Preserve existing authentication behavior and all existing Project Registration API routes.

The infrastructure dependency referenced in the issue comment appears resolved: issue #7 is closed and its API/Lambda infrastructure exists in the current checkout. Verify the development deployment during integration validation.

## Request and response contract

Document one consistent contract shared by the frontend and Lambda. Replace the issue's ambiguous `funding` string example with the structured `fundingRange` used in its response example.

Example request:

```json
{
  "projectName": "Example Project",
  "description": "Technical training and mentorship for aspiring founders.",
  "linkedInUrl": "https://www.linkedin.com/company/example",
  "supportType": "both",
  "needs": "Technical mentorship and seed funding.",
  "fundingRange": {
    "minimum": 10000,
    "maximum": 50000
  },
  "visionDocument": null
}
```

Contract rules:

- Require nonempty strings for `projectName`, `description`, and `needs`; trim surrounding whitespace.
- Restrict `supportType` to `funding`, `human_capital`, or `both`.
- Send an empty optional URL as `null`; accept an omitted or null URL and normalize it to `null`. Validate supplied URLs as absolute HTTP/HTTPS URLs; do not restrict them to LinkedIn.
- Require a funding object with numeric `minimum` and `maximum` for funding/both. Reject numeric strings, booleans, non-finite values, negative bounds, and reversed bounds. For human capital only, require omitted/null funding and normalize it to `null`.
- Accept omitted/null `visionDocument` and return `null`; reject supplied document data until integration is implemented.
- Reject unknown request fields, including backend-controlled fields such as `projectId`, user/Founder ID, status, validation state, reviewer, and validation notes.

Successful response: the normalized request fields plus a generated UUID `projectId` and `status: "draft"`, returned directly as JSON with `201 Created`. Do not invent a persisted Founder relationship or a validation state not defined by this task.

Example response:

```json
{
  "projectId": "f5c4d23a-5b41-4b14-8346-1f9c9b570890",
  "projectName": "Example Project",
  "description": "Technical training and mentorship for aspiring founders.",
  "linkedInUrl": "https://www.linkedin.com/company/example",
  "supportType": "both",
  "needs": "Technical mentorship and seed funding.",
  "fundingRange": {
    "minimum": 10000,
    "maximum": 50000
  },
  "visionDocument": null,
  "status": "draft"
}
```

Use a documented error shape such as `{ "message": "Invalid registration request.", "errors": { "projectName": "Enter a project name." } }` for field validation failures. Form-level parsing errors may contain only `message`.

## Implementation sequence

### 1. Establish shared authentication configuration

- Extract the existing Amplify configuration from `frontend/app/auth/AuthForm.tsx` into a reusable frontend module so registration can initialize authentication on direct navigation.
- Check session completion and trusted Cognito group claims before showing the form or home-page registration button. Redirect unauthenticated form visitors to sign-in and show an access-denied state for authenticated users without Founder membership.
- Redirect to the home page only after sign-in completes, and show the registration button after confirmed Founder membership. Retain the current signup and confirmation flow.
- Do not add group provisioning or returning-Founder project lookup.

### 2. Build the registration page

- Add `frontend/app/register-project/page.tsx` and implement the existing empty `frontend/app/registration/Registration.tsx` component, reusing it under the chosen route.
- Follow the existing authentication pages' visual styling with a minimal responsive layout.
- Add controlled fields for the agreed contract and display funding inputs conditionally. Clear funding values when switching to human capital only.
- Validate required fields and funding/URL rules before submission. Show accessible field errors, appropriate focus behavior, and a form-level status message.
- Prevent invalid requests and repeated submissions while pending. Preserve input values on failed requests.

### 3. Connect the frontend to the API

- Read the API base URL from `NEXT_PUBLIC_PROJECT_API_URL`; document an example environment configuration without committing deployment-specific values.
- Construct `/projects` safely for a base URL that may include an API stage or trailing slash.
- Send JSON with `Content-Type: application/json` and the current Cognito ID token in the `Authorization` header for the REST API's existing Cognito authorizer configuration.
- Handle missing configuration, network failures, non-JSON error responses, validation errors, authorization failures, and other non-2xx responses with useful messages.
- On `201`, display successful processing on the current page. Avoid language implying durable project creation, dashboard navigation, or later retrieval using the temporary UUID.

### 4. Implement registration Lambda processing

- Update `infrastructure/functions/registration-lambda/main.py`.
- Fix the existing missing comma between response headers, which currently prevents the file from parsing.
- Explicitly dispatch the existing route/method combinations. Keep minimal responses for `GET /projects`, `GET /projects/{projectId}`, `PATCH /projects/{projectId}`, and `POST /projects/{projectId}/submit`; return `404` for unsupported combinations.
- For `POST /projects`, require trusted API Gateway authorizer claims and Founder membership. Do not accept identity or group claims from the request payload.
- Parse the API Gateway body, including base64-encoded bodies when indicated. Reject malformed JSON, missing bodies, and non-object JSON with `400`.
- Validate and normalize the agreed contract, then generate a UUID and initial draft status.
- Return normalized JSON with `201`; return `400` for validation failures, `403` for authenticated non-Founders, and a safe `500` for unexpected failures. API Gateway handles missing/invalid authentication before invocation.
- Include browser-readable CORS headers on all Lambda responses. Do not store projects or call database/storage services.

### 5. Update and verify API infrastructure

- Reuse the existing Cognito authorizer in `infrastructure/nomad_constructs/api_construct.py` for `POST /projects`. Founder authorization remains in the registration handler because a Cognito authorizer alone does not enforce group membership.
- Preserve every existing Project Registration resource and method. Do not expand authorization changes to unrelated routes in this task.
- Keep CORS preflight compatible with `Content-Type` and `Authorization`. Ensure API Gateway-generated authorization/error responses also have the expected CORS headers.
- Keep the current localhost development origin; document any additional origin needed for a deployed frontend before configuring it.
- Preserve registration Lambda logging permissions without adding RDS, S3, or Cognito administrative access.

### 6. Validate and document

- Add focused Python tests for valid support types, normalized output, generated UUID/draft status, malformed/non-object/missing bodies, required fields, incorrect types, URL validation, funding edge cases, protected/unknown fields, Founder authorization, preserved route stubs, and unsupported routes.
- Add CDK assertions for Cognito authorization on project creation, retained routes/integrations, CORS configuration, and absence of new registration Lambda resource permissions.
- Verify the browser workflow: signed-out access, non-Founder access, direct Founder access, completed-sign-in redirect, Founder home-page button, conditional funding inputs, validation, loading, duplicate-submission prevention, recoverable failures, and successful processing without navigation.
- Run frontend lint/build, the infrastructure Python tests, and `cdk synth`. Review `cdk diff` against the development environment and summarize only expected feature-specific changes.
- Demonstrate the authenticated form → API Gateway → Lambda → `201` workflow in the development environment when the feature is deployed. Report deployment prerequisites separately if that environment is unavailable.
- Document the request/response/error contract, environment variable, temporary processing behavior, and example API calls.
- Include example request/response and validation evidence in the PR. Explicitly request clarification on the route discrepancy and the out-of-scope Founder membership assignment dependency.

## Completion criteria

- `/register-project` renders the minimal form for authenticated Founder members.
- Completed sign-in redirects to the home page, which exposes a plain registration button only to authenticated Founders.
- Frontend and Lambda implement the same documented contract and validation rules.
- An authorized valid request returns normalized data, a generated UUID, and draft status with `201`.
- Invalid payloads return `400`; authenticated non-Founders cannot create projects.
- Browser loading, error, and success states work, and success does not imply persistence.
- Existing registration routes and authentication functionality remain operational.
- No project persistence, uploads, group provisioning, or unrelated permissions are introduced.
- Required local checks pass and development integration/diff evidence is recorded when available.
