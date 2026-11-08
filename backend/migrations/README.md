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

On RDS the password is sent in the Lambda invoke payload for each run, not
stored in environment variables; see Section 5.

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

### 5.2 Review the diff

From `infrastructure/` with the venv active:

```bash
cd infrastructure
. .venv/bin/activate
npx cdk diff NomadMigrationStack -c deploy_migrator=true
npx cdk diff NomadStack
```

The first shows the new stack (only additions). The second must show no change.

### 5.3 Deploy

```bash
npx cdk deploy NomadMigrationStack -c deploy_migrator=true
```

### 5.4 Invoke the Lambda

Define this function once per shell. It asks for the password, writes the
payload to a mode-600 temp file, invokes, then deletes the file. The password
is never on a command line and never in shell history:

```bash
invoke_migrator() {
  local TMP
  umask 077
  TMP=$(mktemp)
  read -rs -p "database password: " PW
  echo
  jq -n --arg a "$1" --arg pw "$PW" '{action:$a,password:$pw}' > "$TMP"
  aws lambda invoke --function-name nomad-db-migrator \
    --cli-binary-format raw-in-base64-out \
    --payload "file://$TMP" out.json >/dev/null
  rm -f "$TMP"
  unset PW
  jq -r .output out.json
}
```

Run these actions in order and check that `exitCode` is `0` in each output:

```bash
invoke_migrator status
invoke_migrator up
invoke_migrator up       # second run: "nothing to do"
invoke_migrator check
invoke_migrator verify
invoke_migrator integrity
```

To see the full result JSON (not just `output`), run `cat out.json`. Delete
`out.json` when done; do not commit it (add nothing to git).

Test the function without calling AWS. This fake `aws` reads the payload file
and writes a result that echoes only the action, so you can confirm the payload
was built and the password is not in `out.json`:

```bash
aws() {
  local src=""
  for a in "$@"; do case "$a" in file://*) src="${a#file://}";; esac; done
  jq '{exitCode:0, ok:true, output:("fake: " + .action)}' "$src" > out.json
}
invoke_migrator status
jq -r .output out.json
```

### 5.5 Remove the stack

When no longer needed:

```bash
npx cdk destroy NomadMigrationStack -c deploy_migrator=true
```

### Actions

| Action | Payload | Effect |
| --- | --- | --- |
| `status` | `{"action":"status","password":"..."}` | list applied and pending versions |
| `up` | `{"action":"up","password":"..."}` | apply pending versions |
| `check` | `{"action":"check","password":"..."}` | report versions pending or differing from the repo |
| `verify` | `{"action":"verify","password":"..."}` | verify the deployed schema |
| `report` | `{"action":"report","password":"..."}` | dump the schema as JSON (structure + hash) |
| `integrity` | `{"action":"integrity","password":"..."}` | run the constraint tests; every test is rolled back |
| `down` | `{"action":"down","steps":N,"confirm":"drop-data","password":"..."}` | revert the newest N versions (`steps` is required) |

The result is JSON: `{"exitCode": n, "ok": bool, "output": text}`. The password
is replaced with `***` in `output`.

Exit codes:

| `exitCode` | Meaning |
| --- | --- |
| `0` | ok |
| `1` | `check` has only pending versions, or `verify` found problems |
| `2` | refused (`down` without confirmation), mismatch (`check`), a bad request, or a missing or invalid password |
| `3` | error (missing configuration or a migration error) |

### Cost and security

- There is no VPC endpoint and no NAT gateway. The migrator security group has
  `allow_all_outbound=False` and one egress rule, so it can send traffic only to
  the database on TCP 5432.
- The database password is sent in the invoke payload, over TLS to the Lambda
  API. It is removed from the Lambda output and is not stored by the function.
- The password does appear in the AWS API call that you make. It is not stored
  in the function configuration. CloudTrail Lambda data events, if enabled in
  the account, may record request parameters, so use a password you can rotate.
  Reset the database password after the migration if the account logs Lambda
  data events.
- TLS is `verify-full` with the bundled AWS RDS CA bundle.
- The only inbound change on the RDS security group is port 5432 from the
  migrator security group. The existing `155.246.151.34/32` rule is unchanged.
- The RDS security group belongs to `NomadStack` (from `rds_template.yaml`), and
  the migrator rule is a separate resource in `NomadMigrationStack`. A later
  `cdk deploy NomadStack` that changes this security group can remove the
  migrator rule. Then the migrator cannot reach the database. If that happens,
  deploy `NomadMigrationStack` again to restore the rule. Removing the migration
  stack removes only its own rule.
- `integrity` runs about 97 tests. Failure messages are plainer, because the Lambda
  package is read-only and pytest cannot rewrite assertions.

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
   umask 077
   TMP=$(mktemp)
   read -rs -p "database password: " PW
   echo
   jq -n --arg pw "$PW" '{action:"down",steps:1,confirm:"drop-data",password:$pw}' > "$TMP"
   aws lambda invoke --function-name nomad-db-migrator \
     --cli-binary-format raw-in-base64-out \
     --payload "file://$TMP" out.json >/dev/null
   rm -f "$TMP"
   unset PW
   cat out.json
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

## 11. Compare a database with the repository (report)

`report` dumps the complete structure of the `public` schema as deterministic
JSON plus a SHA-256 hash, read-only. It runs inside a `SET TRANSACTION READ
ONLY` transaction and creates nothing. It covers tables, columns, constraints
(including the `ON DELETE` rule of foreign keys), indexes, triggers, functions,
and the applied migration checksums. It excludes owners, ACLs, OIDs,
tablespaces, timestamps, and the server version, so two databases built from
the same migration files produce the same `hash` even when their names, owners,
and OIDs differ.

Run `report` on the target database (via the Lambda action `report`, Section
5.4) and on a local database built from the same files (Section 6):

```bash
# local database (reachable, e.g. the Docker test database)
cd backend
uv run python migrations/migrate.py report > /tmp/opencode/report_local.json

# target database: invoke the Lambda action "report" and save its JSON output
# (out.json above) to report_target.json
```

Then compare:

```bash
jq -r .hash report_local.json report_target.json
# the two hashes must be equal

diff <(jq -S .schema report_local.json) <(jq -S .schema report_target.json)
# no output means the schemas are identical
```

The `hash` covers structure and applied migration checksums but not row counts
or the server version. `row_counts` shows whether each table holds data
(`schema_migrations` should equal the number of applied migrations).
