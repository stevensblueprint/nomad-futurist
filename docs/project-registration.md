# Project registration

`/register-project` allows signed-in Cognito `Founders` members to send project details to `POST /projects`. The API validates and normalizes the request, returns a temporary UUID and draft status, and does not save a project. The page stays on the form after success.

## Configuration

Copy `frontend/.env.example` to `frontend/.env.local` and supply the existing Cognito pool ID, app client ID, and Project API base URL from the CDK outputs. The base URL must include the API stage, for example `https://example.execute-api.us-east-1.amazonaws.com/dev/`. The frontend appends `/projects` and sends the current Cognito ID token in `Authorization`.

These public environment values are included in the frontend build. Restart development or rebuild after changing them. Never put credentials or tokens in committed environment files.

API and registration Lambda CORS default to `http://localhost:3000`. CDK's `frontendOrigin` context configures the preflight, gateway error responses, and registration Lambda response headers together. It accepts one HTTP/HTTPS origin without a path.

To use port 3001, run these commands from `infrastructure/` and review the diff before deployment:

```sh
npx cdk synth -c frontendOrigin=http://localhost:3001
npx cdk diff --no-change-set -c frontendOrigin=http://localhost:3001
npx cdk deploy NomadStack -c frontendOrigin=http://localhost:3001
```

Then start the frontend from the repository root:

```sh
npm run dev --workspace=@nomad/frontend -- --port 3001
```

Open `http://localhost:3001/sign-in`. Sign in again because browser authentication storage is separate for each origin. The API URL in `.env.local` stays the same. Continue supplying the same `frontendOrigin` context on subsequent deployments; omitting it restores port 3000.

## Access and navigation

After completed sign-in, Founder members see a “Register your project” link. There is no automatic redirect. Direct visits to the form check the session; signed-out visitors go to sign-in and non-Founders see an access-denied page. API Gateway validates authentication for project creation, and the registration Lambda checks the trusted authorizer group claim.

Self-signup does not assign the `Founders` group. Automatic group assignment is outside issue #27; accounts must receive that membership elsewhere before registration is available.

## Contract

Required trimmed strings: `projectName`, `description`, `needs`. `supportType` must be `funding`, `human_capital`, or `both`.

- `linkedInUrl`: optional absolute HTTP/HTTPS project or company URL; omitted, null, or blank values normalize to null.
- `fundingRange`: USD minimum/maximum numbers, both required for funding/both, finite and nonnegative with minimum ≤ maximum. Human capital only uses null or omits the field. Numeric strings and booleans are invalid.
- `visionDocument`: null or omitted. Document upload is not available.
- Other fields are rejected, including client-supplied IDs, status, reviewer, and validation data.

Example request:

```json
{
  "projectName": "Example Project",
  "description": "Technical training for aspiring founders.",
  "linkedInUrl": "https://example.org",
  "supportType": "both",
  "needs": "Technical mentorship and seed funding.",
  "fundingRange": { "minimum": 10000, "maximum": 50000 },
  "visionDocument": null
}
```

Example `201 Created` response:

```json
{
  "projectId": "f5c4d23a-5b41-4b14-8346-1f9c9b570890",
  "projectName": "Example Project",
  "description": "Technical training for aspiring founders.",
  "linkedInUrl": "https://example.org",
  "supportType": "both",
  "needs": "Technical mentorship and seed funding.",
  "fundingRange": { "minimum": 10000, "maximum": 50000 },
  "visionDocument": null,
  "status": "draft"
}
```

The UUID is temporary. It cannot be used to retrieve a saved project. Existing list/detail/update/submit routes retain their placeholder behavior.

Malformed JSON, non-object bodies, and validation failures return `400`. Field errors use this shape:

```json
{
  "message": "Invalid registration request.",
  "errors": { "projectName": "Enter a nonempty value." }
}
```

Missing/invalid authentication is rejected by API Gateway; direct Lambda invocation without claims returns `401`. Authenticated non-Founders receive `403`, unsupported Lambda route/method combinations receive `404`, and unexpected processing failures receive a safe `500` message. Gateway errors may have only a `message` property.

## Validation commands

From the repository root:

```sh
npm run lint
npm run build
npm run test:registration --workspace=@nomad/frontend
```

From `infrastructure/`, with the Python dependencies installed:

```sh
.venv/bin/python -m unittest discover -s tests -v
npx cdk synth --app '.venv/bin/python app.py'
npx cdk diff --no-change-set --app '.venv/bin/python app.py'
```

Before deployment, review the development diff: project creation gains the existing Cognito authorizer, gateway errors gain CORS headers, and the registration Lambda asset changes. No RDS/S3 resources, registration Lambda resource permissions, or Founder provisioning are added.

## Implementation validation (October 13, 2026)

- All 51 Python tests and four frontend registration helper tests passed.
- Frontend lint and TypeScript checks passed.
- Production build passed with `npm run build --workspace=@nomad/frontend -- --webpack`. The default Turbopack build encountered an environment restriction binding a worker port; the existing Google Fonts also required network access.
- CDK synthesis passed. Local validation used `JSII_RUNTIME_PACKAGE_CACHE_ROOT=/tmp/nomad-jsii-cache` to keep its cache in a writable location.
- Local browser checks confirmed signed-out redirection, non-Founder denial, Founder form access, conditional funding, complete normalized JSON with an authorization token, non-JSON error recovery with preserved inputs, pending input/button disabling, duplicate-submission prevention, and success without navigation.
- The actual Lambda handler returned `201` through a temporary localhost API fixture and the form displayed success. Cognito sessions and API Gateway authorization were mocked for these checks; they do not establish deployed authentication/integration behavior.
- `cdk diff --no-change-set` could not resolve an AWS account. No deployment or live Cognito/API Gateway end-to-end verification was performed. Those checks remain necessary in the configured development environment.

## Infrastructure reconciliation, October 14, 2026

The first development diff exposed an existing mismatch between this branch and the deployed stack. The deployed stack already manages the RDS database, VPC, subnet group, two subnets, and security group, but this branch's database construct was empty. Deploying it would have detached those retained resources from CloudFormation.

Restored the existing resource definitions from `origin/feat/rds_iac` and verified all six against the deployed template in account `904233098281`, region `us-east-1`. `DatabaseConstruct` now includes them with their deployed logical IDs, properties, and retention policies. This preserves existing stack management without creating or importing another database or changing the network rules. The template describes that existing environment and is not a generic template for creating another database.

Lambda staging now excludes `__pycache__`, `.pyc`, and `.pyo` files. Local test execution had added bytecode to the admin Lambda package and caused an unrelated code-asset change. The clean admin and validation package hashes match the deployed packages.

All 54 infrastructure tests and CDK synthesis passed after these fixes. The read-only development diff no longer contains database/network removals, security-group changes, or an admin Lambda update. It contains only the registration Lambda update, project creation authorization, gateway CORS responses, and API deployment/stage update. No deployment was performed. Live Cognito/API Gateway workflow verification remains pending.

## Notes for a future PR

No PR is created as part of this implementation request. When preparing one:

- Explain that `/register-project` follows the acceptance criteria while the issue's workflow names `/registration`, and ask the issue author to confirm the route.
- Explain the Founder membership dependency and ask where self-signup group assignment will be handled. It remains outside this change.
- Include the example request/response above and the completed validation results, distinguishing local checks from deployed integration checks.
