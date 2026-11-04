# Nomad Futurist Incubator

The Nomad Futurist Incubator is a web application for Founder registration, project intake, and future project validation and administrative workflows. This README is primarily a **local development setup guide**: follow the steps below to install the dependencies, configure the application, and run the frontend on your machine.

The frontend uses **Next.js, React, TypeScript, and AWS Amplify**. Authentication and API requests connect to **AWS services hosted remotely**. The infrastructure is defined with **AWS CDK v2 (Python)**, but **you do not need to deploy a CDK stack or install the AWS CLI to run the frontend locally**.

## Quick start

If you already have **Git**, **Node.js 22 LTS**, **npm**, and the correct AWS frontend configuration values:

```bash
# Clone the repository
git clone https://github.com/stevensblueprint/nomad-futurist.git
cd nomad-futurist

# Install dependencies for both npm workspaces
npm ci

# Create your local frontend configuration
cp frontend/.env.example frontend/.env.local

# Edit frontend/.env.local and replace the example/blank values
# with the Cognito and API Gateway values provided by the team.

# Run the Next.js development server
npm run dev
```

Open **http://localhost:3000** in your browser. Keep the terminal running while developing; use **Ctrl+C** to stop the server.

> **Important:** A successful local start does not automatically mean Cognito sign-up, email confirmation, and project API requests will work. These flows need valid configuration values and accessible AWS resources in the shared development environment. See [Configure environment variables](#4-configure-environment-variables).

## 1. Install prerequisites

### Required for frontend development

| Dependency | Why it is needed | Suggested version |
| --- | --- | --- |
| Git | Clone the repository and manage branches | Current stable release |
| Node.js | Run Next.js and the frontend tooling | **22 LTS** |
| npm | Install and run workspace packages; included with Node.js | Version bundled with Node.js |
| Code editor | Edit source code and environment configuration | VS Code or equivalent |

Confirm the installations:

```bash
git --version
node --version
npm --version
```

**Windows:** We recommend Ubuntu through **Windows Subsystem for Linux (WSL)** for a consistent development environment. Open PowerShell **as Administrator** to install WSL if it is not already available:

```powershell
wsl --install -d Ubuntu
```

Complete any Windows restart and Ubuntu first-run setup that Windows requests. Open the **Ubuntu/WSL terminal** and continue with the Bash commands in this README. Install Git and prerequisite utilities inside Ubuntu if needed:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates
```

For Node.js on WSL/Linux or macOS, use your approved Node version manager (for example, [nvm](https://github.com/nvm-sh/nvm)) to install and select Node 22:

```bash
nvm install 22
nvm use 22
node --version
npm --version
```

The `nvm` commands require **nvm to be installed first**. Alternatively, install Node.js 22 from the [official Node.js downloads](https://nodejs.org/en/download). If you develop on **native Windows**, use the Windows Node installer and run the equivalent commands in PowerShell; replace `cp` with `Copy-Item` where needed.

### Optional tools for infrastructure developers

You only need the following to work on AWS CDK infrastructure or run AWS-facing CDK commands:

- **Python 3.12**, including `venv` and `pip`.
- **AWS CLI v2**, configured with your own authorized AWS identity/profile.
- Authorized AWS account permissions for the operations you need.

See [AWS CDK infrastructure (optional)](#aws-cdk-infrastructure-optional). **Do not install or deploy infrastructure just to test frontend changes.**

## 2. Clone the repository

In your Linux/WSL/macOS terminal:

```bash
git clone https://github.com/stevensblueprint/nomad-futurist.git
cd nomad-futurist
```

If you already cloned the repository, update your local `main` first (make sure you have committed or saved any local modifications):

```bash
git fetch origin
git switch main
git pull --ff-only origin main
```

On Windows with WSL, keep the working copy in the Linux filesystem (for example, under `~/projects/`) rather than a Windows-mounted path when possible. This typically improves Node/Next.js file-watching performance.

## 3. Install project dependencies

The repository uses **npm workspaces** for `frontend/` and `infrastructure/`. Run the install command **once from the repository root**:

```bash
npm ci
```

This installs the versions recorded in the root `package-lock.json`, including:

- Next.js, React, React DOM, and TypeScript.
- AWS Amplify and Amplify React UI dependencies.
- ESLint and frontend build tooling.
- The AWS CDK CLI package used by the infrastructure workspace.

**`npm ci` installs JavaScript packages; it does not install the Python CDK dependencies.** You do not need those Python packages to run the frontend.

Do not separately run `npm install` in individual workspaces as part of the normal setup, and do not commit `node_modules/`. If dependencies change in a PR, rerun `npm ci` from the root after updating your branch.

## 4. Configure environment variables

The frontend connects to the **existing shared AWS development environment**. Create a local environment file from the checked-in template:

```bash
cp frontend/.env.example frontend/.env.local
```

On native Windows PowerShell, use:

```powershell
Copy-Item frontend/.env.example frontend/.env.local
```

Edit `frontend/.env.local` with the **actual values provided by your project lead or authorized AWS team**:

```dotenv
NEXT_PUBLIC_COGNITO_USER_POOL_ID=<your-user-pool-id>
NEXT_PUBLIC_COGNITO_APP_CLIENT_ID=<your-spa-app-client-id>
NEXT_PUBLIC_PROJECT_API_URL=https://<api-id>.execute-api.us-east-1.amazonaws.com/dev
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | Identifies the existing Cognito User Pool |
| `NEXT_PUBLIC_COGNITO_APP_CLIENT_ID` | Identifies the public SPA app client; **not** a client secret |
| `NEXT_PUBLIC_PROJECT_API_URL` | Base URL for the deployed API Gateway `dev` stage; the frontend appends paths such as `/projects` |

The source of these values is the **`NomadStack` CloudFormation outputs** (`CognitoUserPoolId`, `CognitoUserPoolAppClientId`, and `ProjectApiUrl`, nested under their constructs' output names). If you have authorized AWS CLI access, you can inspect the outputs with:

```bash
aws cloudformation describe-stacks \
  --stack-name NomadStack \
  --region us-east-1 \
  --query 'Stacks[0].Outputs'
```

Otherwise, request the values from the project lead. **Do not run `cdk deploy` to generate configuration values.**

> **Security:** `NEXT_PUBLIC_` variables are embedded in browser-accessible code. Never put AWS access keys, passwords, API secrets, or a Cognito client secret in them. Keep `.env.local` out of Git. Restart `npm run dev` after changing environment variables.

### What runs locally vs. in AWS?

| Runs on your machine | Uses the shared AWS environment |
| --- | --- |
| Next.js development server on `localhost:3000` | Cognito User Pool for sign-up, sign-in, and confirmation |
| React pages, styling, and client-side validation | SES-backed email delivery configured for Cognito |
| Frontend tests, linting, and builds | API Gateway and Lambda for project registration and other API routes |
| Local `.env.local` configuration | Existing RDS and networking resources (not yet integrated into project persistence) |

You can work on styling and UI components without deploying AWS resources. Authentication and API integration tests, however, require working connections to the corresponding remote services.

## 5. Run the application locally

From the **repository root**:

```bash
npm run dev
```

Open **http://localhost:3000** in a browser. The root script delegates to the `@nomad/frontend` workspace and starts the Next.js development server.

Typical workflow:

1. Start `npm run dev` and leave that terminal open.
2. Open `http://localhost:3000`.
3. Make changes under `frontend/` and reload the browser as needed. Next.js generally refreshes changes automatically.
4. Use **Ctrl+C** to stop the local server.

You can also start the frontend explicitly:

```bash
npm run dev --workspace=@nomad/frontend
```

**Do not use `npx cdk deploy` to run the website locally.** That command deploys infrastructure into AWS, not onto your computer.

### Available frontend pages

| Route | Current role |
| --- | --- |
| `/` | Home page; authentication-aware UI |
| `/sign-up` | Founder account creation and email confirmation |
| `/sign-in` | Existing-account sign-in |
| `/registration` | Founder project registration form |

Other frontend directories are present, but their presence alone does not mean their end-to-end functionality is complete. User access and account group membership are determined by the shared Cognito configuration.

### Authentication and registration behavior

- Founder sign-up calls Cognito and requires email confirmation. On confirmation, the Post-Confirmation Lambda assigns the **Founders** group.
- The frontend supports automatic sign-in when Cognito completes that flow, with a sign-in fallback.
- The Project Registration form sends an authenticated `POST /projects` request to API Gateway.
- **Project submissions currently return a validated temporary response and are not persisted to PostgreSQL.** A successful API response does not create a saved project record.
- Email verification delivery depends on SES configuration and the account's current sending permissions. If the email never arrives, confirm the relevant AWS configuration with the infrastructure team.

**Stopping `npm run dev` or closing the terminal does not, by itself, guarantee that the browser's Cognito session is signed out.** Use the application's sign-out action when appropriate; session lifecycle requirements are handled separately from local server startup.

## 6. Validate your changes

Run these from the repository root before requesting review:

```bash
# Check frontend lint errors
npm run lint

# Build the Next.js application
npm run build

# Run existing registration helper tests
npm run test:registration --workspace=@nomad/frontend

# Run existing authentication helper tests
npm run test:auth --workspace=@nomad/frontend
```

For a separate TypeScript check, use:

```bash
npx tsc --noEmit -p frontend/tsconfig.json
```

The root `build` and `lint` scripts operate on the frontend. The two test scripts above are defined in `frontend/package.json`; there is no single repository-wide `npm test` script configured for all workspaces.

## 7. Troubleshooting local setup

| Problem | What to check |
| --- | --- |
| `node`, `npm`, or `nvm` is not found | Install Node 22; confirm your shell/path and whether `nvm` was initialized |
| `npm ci` fails | Run from repository root, use the committed lockfile, verify Node/npm version, and inspect the first error |
| `localhost:3000` is unavailable | Confirm the dev server is running; stop any other process occupying port 3000 |
| Next.js starts on port 3001 | Prefer freeing port 3000. API Gateway's current CORS origin is `http://localhost:3000`; requests from another origin may fail |
| Cognito configuration error | Check `.env.local` spelling and real User Pool/App Client IDs; restart the dev server |
| Login or registration requests fail | Confirm that AWS services are reachable, the user's Cognito account is confirmed, and the correct app client is configured |
| Confirmation code email does not arrive | Check Cognito user confirmation status and SES identity/sandbox/sending restrictions with the AWS team |
| Browser reports a CORS error | Confirm the port/origin and the API URL; CORS must be corrected in the deployed API configuration, not bypassed in the browser |
| `POST /projects` returns `401` or `403` | Check signed-in session and **Founders** group membership |
| `POST /projects` succeeds but project disappears | Expected for current scope: the handler does not save projects to PostgreSQL |
| Environment changes do not appear | Stop and restart `npm run dev` after editing `.env.local` |

Avoid changing the shared AWS infrastructure to work around a local setup issue without discussing it with the infrastructure lead.

## Repository layout

```text
nomad-futurist/
├── README.md
├── package.json                 # npm workspaces and root frontend scripts
├── package-lock.json            # locked npm dependency versions
├── frontend/
│   ├── .env.example             # example browser-side configuration
│   ├── app/                     # Next.js App Router pages and styles
│   │   ├── auth/                # Amplify configuration and shared auth components
│   │   ├── sign-up/
│   │   ├── sign-in/
│   │   └── registration/
│   └── package.json             # frontend scripts and dependencies
├── backend/                     # backend source scaffolding
└── infrastructure/
    ├── app.py                   # instantiates NomadStack
    ├── cdk.json                 # runs the Python CDK app
    ├── requirements.txt         # Python infrastructure dependencies
    ├── stacks/
    │   └── nomad_stack.py       # one CloudFormation stack
    ├── nomad_constructs/        # project-specific AWS constructs
    ├── functions/               # Lambda handler code
    └── tests/                   # Python unit tests
```

## AWS CDK infrastructure (optional)

This section is for developers working on the shared AWS infrastructure. **Frontend contributors may skip it.**

### Current architecture at a glance

The CDK app uses **one stack, `NomadStack`**, deployed to **`us-east-1`**. Its constructs are:

| Construct | Declared scope |
| --- | --- |
| `AuthConstruct` | Cognito User Pool and SPA app client, `Founders`/`TechnicalStaff`/`Mentors`/`Admin` groups, Post-Confirmation and admin-provisioning Lambdas, existing SES domain-identity reference |
| `ApiConstruct` | REST API Gateway (`nomad-project-api`, stage `dev`), registration/validation Lambda integrations, admin user provisioning route, API logging and CORS |
| `DatabaseConstruct` | Existing PostgreSQL RDS and VPC resources represented through `CfnInclude` and `rds_template.yaml` |
| `NotificationConstruct` | Placeholder: SQS/notification processing are not yet implemented |
| `StorageConstruct` | Placeholder: S3 document storage is not yet implemented |

**Current implementation limits:** Project registration returns a mock/temporary response rather than writing to RDS. Several project and validation endpoints are scaffolding. The presence of S3/SQS placeholders does not mean those AWS resources are deployed by this app.

### Install the optional Python CDK dependencies

Use Python 3.12 and a separate local virtual environment:

```bash
# Ubuntu/WSL: install the venv package if it is missing
sudo apt update
sudo apt install -y python3-venv python3-pip

# From the repository root
cd infrastructure
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

python -c "import aws_cdk, constructs, boto3; print('Python CDK OK')"
npx cdk ls
npx cdk synth NomadStack
```

If your default `python3` is not Python 3.12, use your installed Python 3.12 interpreter when creating the environment (for example, `python3.12 -m venv .venv`). Avoid naming a local directory `infrastructure/constructs/` because it shadows the third-party Python package.

Expected stack name: **`NomadStack`**, not the older `NomadAuthStack`, `NomadDatabaseStack`, or `NomadApiStack`.

### AWS access and safe infrastructure changes

AWS-facing commands require your own authorized AWS CLI authentication and access to the correct account in `us-east-1`. Never share or commit credentials. Confirm identity before any changes:

```bash
aws sts get-caller-identity
```

Only when authorized to work on infrastructure:

```bash
cd infrastructure
source .venv/bin/activate

# Local Python tests and synthesis
python -m unittest discover -s tests -v
npx cdk synth NomadStack

# Compare with resources currently deployed in AWS
npx cdk diff NomadStack
```

**Do not run `npx cdk deploy NomadStack`, `cdk import`, or `cdk bootstrap` to set up your local frontend.** These commands affect AWS infrastructure. Changes to the imported RDS/VPC resources, Cognito User Pool, SES identity configuration, IAM policies, or resource logical IDs require explicit review and approval. Verify that a live `cdk diff` contains only the intended changes before any authorized deployment.

## Git and contribution workflow

Work from a current local `main` and open focused PRs back into `main`:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/short-description
```

After making and validating changes:

```bash
git status
git add <changed-files>
git commit -m "feat(frontend): describe the change"
git push -u origin feat/short-description
```

Follow repository reviewer and branch-protection requirements. Keep frontend design changes separate from CDK infrastructure modifications wherever possible.

Files such as `node_modules/`, `.next/`, `.venv/`, `cdk.out/`, and `.env.local` are local or generated and must not be committed. Review `git status` before pushing.
