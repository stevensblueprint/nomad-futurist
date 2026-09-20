# AWS CDK Infrastructure Development

The Nomad Incubator infrastructure is managed using **AWS CDK v2 with Python**.

The CDK application is located under:

```text
infrastructure/
├── app.py
├── cdk.json
├── requirements.txt
├── package.json
│
├── stacks/
│   ├── __init__.py
│   ├── api_stack.py
│   ├── auth_stack.py
│   └── db_stack.py
│
└── nomad_constructs/
    └── __init__.py
```

The current infrastructure stacks are organized as follows:

- `auth_stack.py` — Amazon Cognito infrastructure
- `db_stack.py` — PostgreSQL Amazon RDS infrastructure
- `api_stack.py` — Amazon API Gateway and AWS Lambda infrastructure
- `nomad_constructs/` — reusable project-specific CDK constructs
- `app.py` — CDK application entry point

---

## Prerequisites

Before working with the infrastructure, install the following locally.

### 1. WSL / Linux Environment

Infrastructure development should be performed from the project's WSL/Linux environment.

Verify:

```bash
uname -a
```

---

### 2. Node.js

AWS CDK's CLI runs on Node.js even though the infrastructure application itself is written in Python.

The project standard is:

```text
Node.js 22 LTS
```

Verify:

```bash
node --version
npm --version
```

If using `nvm`:

```bash
nvm install 22
nvm use 22
```

---

### 3. Python

The CDK application uses Python.

Recommended version:

```text
Python 3.12
```

Verify:

```bash
python3 --version
```

If Python virtual environments are unavailable on Ubuntu/WSL:

```bash
sudo apt update
sudo apt install -y python3-venv
```

---

### 4. AWS CLI v2

Each developer who needs to run AWS-facing CDK commands must install the AWS CLI in their own WSL environment.

Install the required system dependency:

```bash
sudo apt update
sudo apt install -y unzip
```

Install AWS CLI v2:

```bash
curl -fsSL https://awscli.amazonaws.com/v2/install.sh | bash
```

If `aws` is not found afterward, add the user-local binary directory to the shell path:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

Verify:

```bash
aws --version
```

---

# Initial Repository Setup

The repository uses **npm workspaces**.

Node dependencies are therefore installed from the **repository root**, not independently inside each workspace.

From the repository root:

```bash
npm ci
```

This installs the workspace dependencies defined by the root `package.json` and `package-lock.json`, including the AWS CDK CLI used by `/infrastructure`.

---

# Python CDK Environment Setup

Navigate to the infrastructure directory:

```bash
cd infrastructure
```

## 1. Create a Python Virtual Environment

```bash
python3 -m venv .venv
```

Activate it:

```bash
source .venv/bin/activate
```

The terminal should now show something similar to:

```text
(.venv) user@machine:~/nomad-incubator/infrastructure$
```

The virtual environment must be activated whenever working with the Python CDK application.

---

## 2. Install Python Dependencies

Install the project dependencies:

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

The current `requirements.txt` should contain:

```text
aws-cdk-lib>=2.0.0,<3.0.0
constructs>=10.0.0,<11.0.0
```

Verify that the Python CDK libraries can be imported:

```bash
python -c "import aws_cdk; import constructs; print('Python CDK OK')"
```

Expected output:

```text
Python CDK OK
```

---

## Important: Do Not Create a Local `constructs/` Package

AWS CDK depends on the Python package:

```text
constructs
```

Do not create a project directory named:

```text
infrastructure/constructs/
```

Doing so will shadow the installed Python package and can cause errors such as:

```text
ModuleNotFoundError: No module named 'constructs._jsii'
```

Project-specific constructs belong under:

```text
infrastructure/nomad_constructs/
```

---

# AWS Authentication

AWS authentication is configured **per developer and per local environment**.

AWS credentials, authentication sessions, and credential files must never be committed to Git or shared between developers.

## 1. Sign In

Authenticate using your authorized AWS identity:

```bash
aws login
```

Each infrastructure developer must perform this step from their own WSL environment.

---

## 2. Verify AWS Identity

Run:

```bash
aws sts get-caller-identity
```

Confirm that the returned AWS account and identity correspond to the expected project AWS environment.

Example:

```json
{
  "UserId": "...",
  "Account": "...",
  "Arn": "..."
}
```

Do not continue with AWS-changing operations if the account is incorrect.

---

## 3. Configure the AWS Region

The Nomad Incubator infrastructure is deployed in:

```text
us-east-1
```

Check the current region:

```bash
aws configure get region
```

If no region is configured or the region is incorrect:

```bash
aws configure set region us-east-1
```

Verify again:

```bash
aws configure get region
```

Expected output:

```text
us-east-1
```

---

# Verify the CDK Environment

With `.venv` activated and Node dependencies installed, verify the CDK CLI:

```bash
npx cdk --version
```

Then verify that the CDK application can load the defined stacks:

```bash
npx cdk list
```

Expected stacks may include:

```text
NomadAuthStack
NomadDatabaseStack
NomadApiStack
```

---

# Synthesizing Infrastructure

Before committing infrastructure changes, always verify that CDK can synthesize the application.

Run:

```bash
npx cdk synth
```

This executes:

```text
CDK CLI
   ↓
cdk.json
   ↓
python app.py
   ↓
Python CDK stacks
   ↓
CloudFormation templates
```

Generated CloudFormation artifacts are written to:

```text
infrastructure/cdk.out/
```

`cdk.out/` is generated locally and must not be committed to Git.

---

# Reviewing Infrastructure Changes

Before deploying infrastructure changes, run:

```bash
npx cdk diff
```

This compares the proposed CDK infrastructure against the infrastructure currently deployed in AWS.

Developers must review the output carefully, particularly for:

- Resource creation
- Resource deletion
- Resource replacement
- IAM permission changes
- Networking changes
- Stateful resources such as RDS
- Existing Cognito resources

A successful `cdk synth` does **not** mean that a deployment is safe.

`cdk diff` must be reviewed before deployment or resource import.

---

# Deploying Infrastructure

Only developers authorized to modify the shared AWS environment should deploy infrastructure.

Deploy all eligible stacks:

```bash
npx cdk deploy
```

Or deploy an individual stack:

```bash
npx cdk deploy NomadApiStack
```

Do not deploy changes to shared infrastructure without first reviewing:

```bash
npx cdk diff
```

---

# Importing Existing AWS Resources

Some Nomad infrastructure was originally created manually through the AWS Console.

Examples include:

- Amazon Cognito
- PostgreSQL Amazon RDS

These resources must not be recreated accidentally.

Developers assigned to infrastructure migration should follow:

```text
Existing AWS Resource
        ↓
CloudFormation IaC Generator
        ↓
Review Generated Configuration
        ↓
Represent Resource in CDK
        ↓
cdk synth
        ↓
cdk diff
        ↓
cdk import
```

Use:

```bash
npx cdk import
```

only after confirming that the CDK configuration accurately represents the existing AWS resource.

Do not use a normal deployment to create a duplicate resource when an existing resource is intended to be imported.

---

# CDK Bootstrapping

AWS CDK requires each AWS account/Region environment to be bootstrapped before deployment.

Bootstrapping is normally performed **once per AWS account and Region**, not once per developer.

The project environment is:

```text
AWS Account
+
us-east-1
```

If the environment already contains the CloudFormation stack:

```text
CDKToolkit
```

developers should not bootstrap it again.

If bootstrapping is required, an authorized infrastructure developer can run:

```bash
npx cdk bootstrap aws://ACCOUNT_ID/us-east-1
```

---

# Daily Infrastructure Development Workflow

After the initial environment setup, a developer's normal workflow is:

```bash
# Repository root
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b feat/<feature-name>

# Install/update workspace dependencies
npm ci

# Enter infrastructure
cd infrastructure

# Activate Python environment
source .venv/bin/activate

# Ensure Python dependencies are installed
pip install -r requirements.txt

# Verify AWS identity
aws sts get-caller-identity

# Verify CDK
npx cdk list

# Develop infrastructure...

# Validate CDK
npx cdk synth

# Review AWS changes
npx cdk diff
```

After validation:

```bash
git status
git add <relevant-files>
git commit -m "feat(infrastructure): <description>"
git push -u origin <branch-name>
```

Open a pull request into:

```text
develop
```

---

# Infrastructure Development Responsibilities

Current stack ownership is organized as:

```text
auth_stack.py
    ↓
Cognito Infrastructure

db_stack.py
    ↓
PostgreSQL RDS Infrastructure

api_stack.py
    ↓
API Gateway
Lambda Functions
API → Lambda Integrations
Lambda Execution Roles
```

Feature-specific infrastructure should be implemented within the appropriate stack or reusable construct.

Avoid creating unrelated resources inside another feature's stack.

---

# Git Requirements

The following files and directories must **not** be committed:

```text
.venv/
cdk.out/
node_modules/
__pycache__/
.env
.env.local
```

The repository should commit:

```text
app.py
cdk.json
requirements.txt
package.json
package-lock.json
stacks/
nomad_constructs/
```

Verify ignored files before committing:

```bash
git status
```

A recommended `.gitignore` configuration includes:

```gitignore
# Node
node_modules/

# Next.js
.next/
frontend/.next/
out/

# Python
.venv/
venv/
__pycache__/
*.py[cod]
.pytest_cache/

# AWS CDK
cdk.out/

# Environment files
.env
.env.local
.env.*.local
```

---

# Commit Convention

Infrastructure changes use Conventional Commit formatting.

Examples:

```bash
git commit -m "chore(infrastructure): configure Python CDK environment"
```

```bash
git commit -m "feat(infrastructure): define Cognito resources"
```

```bash
git commit -m "feat(infrastructure): define PostgreSQL RDS resources"
```

```bash
git commit -m "feat(infrastructure): add project API Gateway and Lambda resources"
```

```bash
git commit -m "fix(infrastructure): correct Lambda execution role permissions"
```

Recommended types:

```text
feat      New infrastructure capability
fix       Infrastructure bug fix
chore     Tooling/dependency/configuration changes
refactor  Structural changes without behavior changes
docs      Documentation
test      Infrastructure tests
```

---

# Required Checks Before Opening an Infrastructure PR

At minimum, infrastructure developers should verify:

```bash
source .venv/bin/activate

python -c "import aws_cdk; import constructs; print('Python CDK OK')"

aws sts get-caller-identity

npx cdk list

npx cdk synth

npx cdk diff
```

A pull request should not be considered ready for review if:

```text
cdk synth
```

fails.

For AWS-changing infrastructure, the developer should also review and summarize the relevant:

```text
cdk diff
```

output in the pull request.

---

# New Developer Quick Start

For a developer cloning the repository for the first time:

```bash
# Clone repository
git clone <repository-url>

cd nomad-incubator

# Install Node workspace dependencies
npm ci

# Enter infrastructure
cd infrastructure

# Create Python virtual environment
python3 -m venv .venv

# Activate it
source .venv/bin/activate

# Install Python CDK dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Authenticate to AWS
aws login

# Verify AWS account
aws sts get-caller-identity

# Configure region if necessary
aws configure set region us-east-1

# Verify Python CDK
python -c "import aws_cdk; import constructs; print('Python CDK OK')"

# Verify CDK application
npx cdk --version
npx cdk list

# Synthesize CloudFormation
npx cdk synth
```

If all commands complete successfully, the local Python CDK development environment is ready.
