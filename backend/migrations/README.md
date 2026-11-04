# Database migrations

This directory holds the versioned SQL migrations for the Nomad PostgreSQL
database, plus `migrate.py` (apply, roll back, check) and `verify.py` (check the
deployed schema). The nine application tables come from Section 5 of the
architecture design document.

Migrations on the private RDS instance run through a Lambda inside the VPC; see
Section 5.

## Prerequisites

`python3` and `uv` come from this repo's Nix flake. From the repo root run
`nix develop` (or use `direnv`) to get them. Then install the Python
dependencies on the machine that will run the migrations:

```bash
cd backend
uv sync
```

That installs `psycopg[binary]` and `pytest` into `backend/.venv`. After that,
run the migration tool as `uv run python migrations/migrate.py ...` from
`backend/`.

If you prefer not to use `uv`:

```bash
cd backend/migrations
python -m pip install "psycopg[binary]"
python migrate.py ...
```

## 1. Layout and naming

Each version is a pair of files:

```text
versions/0001_helpers.up.sql
versions/0001_helpers.down.sql
versions/0002_users.up.sql
versions/0002_users.down.sql
...
```

- Versions are `0001..N` with no gaps. A missing or extra number is an error.
- `up.sql` creates the schema; `down.sql` reverses it.
- Never edit a file that has already been applied. The runner records a SHA-256
  checksum of each `up.sql` and stops on a changed checksum. To change something
  that is already applied, add a new version.

## 2. Local test database

The tests use a disposable PostgreSQL 18 in Docker. Start it:

```bash
backend/scripts/test-db.sh start
# prints: export TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/postgres
export TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/postgres
```

Run the tests:

```bash
cd backend
uv run pytest tests/db
```

Stop the container when done:

```bash
backend/scripts/test-db.sh stop
```

## 3. Target

The production target is an existing RDS instance. Nothing new is created.

- Account: `904233098281`, region: `us-east-1`
- Instance: `db-nomad`
- Endpoint: `db-nomad.cjee06yueexr.us-east-1.rds.amazonaws.com`
- Database: `postgres`, schema: `public`
- User: `nomad`
- PostgreSQL 18.3, deletion protection is on.

The instance is private. `PubliclyAccessible` is `false`; it has a private IP
(`10.0.1.22`) in the `nomad-vpc` VPC, which has no internet gateway. You cannot
reach it from a laptop. Migrations on RDS go through the Lambda described in
Section 5.

## 4. Credentials

For direct connections to a database you can reach (the Docker test database,
or any other reachable database), connect with environment variables only:

```text
PGHOST PGUSER PGPASSWORD PGDATABASE PGSSLMODE PGSSLROOTCERT
```

Set the password without storing it anywhere:

```bash
read -rs PGPASSWORD && export PGPASSWORD
```

Credentials are never committed to the repo and never passed on the command
line. `.pgpass` and `*.pem` are in `.gitignore`.

On RDS the password is stored in the Secrets Manager secret `nomad/db-migration`,
not in environment variables; see Section 5.

For direct connections, TLS is required. Set:

```bash
export PGSSLMODE=verify-full
export PGSSLROOTCERT=$HOME/global-bundle.pem
```

The instance CA is `rds-ca-rsa2048-g1`. Download the AWS global bundle once:

```bash
curl -O https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
mv global-bundle.pem $HOME/global-bundle.pem
```

## 5. Run migrations on RDS (private database)

The database is private and the VPC has no internet gateway, so the old direct
method (running `migrate.py` from a laptop on the `155.246.151.34` network) does
not work. The security group rule for `155.246.151.34/32` is unchanged by this
work and, by itself, gives no access.

Migrations on RDS run through the Lambda `nomad-db-migrator` in the stack
`NomadMigrationStack`. The stack exists only while you deploy it with
`-c deploy_migrator=true`, and only from the `infrastructure/` directory.
Region is `us-east-1`; use `AWS_PROFILE=bp2`.

Check the account and the instance first:

```bash
AWS_PROFILE=bp2 aws sts get-caller-identity
# Account must be 904233098281
AWS_PROFILE=bp2 aws rds describe-db-instances --db-instance-identifier db-nomad
# Status must be available
```

### 5.1 Snapshot

Take a snapshot before any change:

```bash
AWS_PROFILE=bp2 aws rds create-db-snapshot \
  --db-instance-identifier db-nomad \
  --db-snapshot-identifier db-nomad-pre-schema-$(date +%Y%m%d)
```

A snapshot `db-nomad-pre-schema-20261103` already exists.

### 5.2 Create the secret

The Lambda reads its credentials from the Secrets Manager secret
`nomad/db-migration`. It holds JSON keys `username`, `password`, `host`, and the
optional `port` and `dbname` (defaults `5432` and `postgres`). Use host
`db-nomad.cjee06yueexr.us-east-1.rds.amazonaws.com`, username `nomad`, dbname
`postgres`.

Create it without putting the password in shell history or the repo:

```bash
umask 077
TMP=$(mktemp)
read -rs PW
printf '{"username":"nomad","password":"%s","host":"db-nomad.cjee06yueexr.us-east-1.rds.amazonaws.com","port":5432,"dbname":"postgres"}\n' "$PW" > "$TMP"
AWS_PROFILE=bp2 aws secretsmanager create-secret --name nomad/db-migration --secret-string "file://$TMP"
shred -u "$TMP"
unset PW
```

If the password contains `"` or `\`, escape them or build the JSON with a JSON
tool instead of `printf`. Creating the secret needs the
`secretsmanager:CreateSecret` permission; the `nomad` IAM group does not have it
today.

### 5.3 Review the diff

From `infrastructure/` with the venv active:

```bash
cd infrastructure
. .venv/bin/activate
npx cdk diff NomadMigrationStack -c deploy_migrator=true
npx cdk diff NomadStack
```

The first shows the new stack (only additions). The second must show no change.

### 5.4 Deploy

```bash
npx cdk deploy NomadMigrationStack -c deploy_migrator=true
```

### 5.5 Invoke the Lambda

Invoke in this order and check that `exitCode` is `0` in each output:

```bash
aws lambda invoke --function-name nomad-db-migrator \
  --cli-binary-format raw-in-base64-out \
  --payload '{"action":"status"}' out.json && cat out.json
```

Or with jq:

```bash
jq -r .output out.json
```

Run these actions in order: `status`, `up`, `up`, `check`, `verify`,
`integrity`. The second `up` says `nothing to do`. Delete `out.json` when done;
do not commit it (add nothing to git).

### 5.6 Remove the stack

When no longer needed:

```bash
npx cdk destroy NomadMigrationStack -c deploy_migrator=true
```

The secret is not managed by CDK. It stays until you delete it by hand.

### Actions

| Action | Payload | Effect |
| --- | --- | --- |
| `status` | `{"action":"status"}` | list applied and pending versions |
| `up` | `{"action":"up"}` | apply pending versions |
| `check` | `{"action":"check"}` | report versions pending or differing from the repo |
| `verify` | `{"action":"verify"}` | verify the deployed schema |
| `integrity` | `{"action":"integrity"}` | run the constraint tests; every test is rolled back |
| `down` | `{"action":"down","steps":N,"confirm":"drop-data"}` | revert the newest N versions |

The result is JSON: `{"exitCode": n, "ok": bool, "output": text}`.

Exit codes:

| `exitCode` | Meaning |
| --- | --- |
| `0` | ok |
| `1` | `check` has only pending versions, or `verify` found problems |
| `2` | refused (`down` without confirmation), mismatch (`check`), or a bad request |
| `3` | error (secret read failure or a migration error) |

### Cost and security

- The Lambda role can read only that one secret. The password is removed from
  the Lambda output.
- TLS is `verify-full` with the bundled AWS RDS CA bundle.
- One Secrets Manager interface endpoint in one subnet exists while the stack
  exists: about $0.01 per hour per AZ (roughly $7 a month).
- The secret costs about $0.40 a month.
- The only inbound change on the RDS security group is port 5432 from the
  migrator security group. The existing `155.246.151.34/32` rule is unchanged.

### CDK CLI version

`package-lock.json` pins the `aws-cdk` CLI to 2.1142.0, but the Python library
resolves to a newer version, so `npx cdk` may print `You need at least CLI
version X`. In that case update the `aws-cdk` version in
`infrastructure/package.json`. This was not changed here.

## 6. Run `migrate.py` directly (reachable databases only)

This works only for a database you can reach directly, such as the Docker test
database (Section 2). It does not work for the private RDS instance; use
Section 5 for RDS.

```bash
export PGHOST=<reachable host> PGUSER=<user> PGDATABASE=postgres
export PGSSLMODE=<verify-full or disable> PGSSLROOTCERT=<path to CA bundle, if TLS>
read -rs PGPASSWORD && export PGPASSWORD
cd backend
uv run python migrations/migrate.py status
uv run python migrations/migrate.py up
uv run python migrations/migrate.py up      # second run: "nothing to do"
uv run python migrations/migrate.py check   # exit 0
uv run python migrations/migrate.py verify  # exit 0
```

`up` is safe to run again: already-applied versions are skipped. Each version
runs in its own transaction; a failed version rolls back and is not recorded.

Exit codes:

| Command | Exit code | Meaning |
| --- | --- | --- |
| `status`, `up`, `down --yes` | `0` | success |
| `check` | `0` | database matches the repository |
| `check` | `1` | only pending versions |
| `check` | `2` | database and repository differ (checksum or unknown version) |
| `verify` | `0` | schema verified |
| `verify` | `1` | problems found |
| `down` without `--yes` | `2` | refused |
| any command | `3` | error (`MigrationError` or database error) |

## 7. Run the integrity tests with no residue

On RDS, run the integrity tests through the Lambda action `integrity` (Section
5). It runs the constraint tests and rolls back every test, so nothing commits.

For a database you can reach directly, run the tests with pytest and
`INTEGRITY_TARGET_DSN`:

```bash
export PGHOST=<reachable host> PGUSER=<user> PGDATABASE=postgres
export PGSSLMODE=<verify-full or disable> PGSSLROOTCERT=<path to CA bundle, if TLS>
read -rs PGPASSWORD && export PGPASSWORD
cd backend
export INTEGRITY_TARGET_DSN="host=$PGHOST dbname=postgres user=$PGUSER sslmode=verify-full sslrootcert=$PGSSLROOTCERT"
export TEST_DATABASE_URL=unused
uv run pytest tests/db/test_integrity.py -k "not round_trip"
```

- `INTEGRITY_TARGET_DSN` is a conninfo string with no password; the password
  comes from `PGPASSWORD`.
- Every test runs inside a transaction that the test fixture rolls back, so no
  row ever commits. `users` and `projects` stay empty.
- The round-trip test `test_full_down_then_up_round_trip` and the
  `fresh_db_url` fixture need a disposable server via `TEST_DATABASE_URL`, so
  deselect it with `-k "not round_trip"`.

## 8. Rollback and recovery

Always take a snapshot first (Section 5.1).

1. **A migration fails.** Its transaction rolls back and the version is not
   recorded. Fix the file and re-run `up`. (Do not fix it by editing a version
   that already succeeded; add a new version instead.)
2. **Undo the newest version on RDS.** Invoke the Lambda `down` action with
   explicit confirmation. This drops tables and data, so snapshot first:

   ```bash
   aws lambda invoke --function-name nomad-db-migrator \
     --cli-binary-format raw-in-base64-out \
     --payload '{"action":"down","steps":1,"confirm":"drop-data"}' out.json && cat out.json
   ```

   For a reachable database, `uv run python migrations/migrate.py down --steps 1 --yes` (from `backend/`).
3. **Data loss or a bad state.** Restore from the pre-migration snapshot into a
   NEW instance with `aws rds restore-db-instance-from-db-snapshot`, check it,
   then switch. Never delete `db-nomad`; deletion protection is on.
4. **`schema_migrations` and the schema disagree.** Run `check` and `verify`,
   then fix with a new forward migration.

## 9. Using another database name

Change `PGDATABASE`. No SQL changes are needed.

## 10. Connecting Lambdas later

Out of scope for now. The application Lambdas are not in the VPC, so wiring them
to RDS needs separate work (VPC config, security group access, and a way to
supply the database credentials).
