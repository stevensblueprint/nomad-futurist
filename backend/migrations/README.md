# Database migrations

This directory holds the versioned SQL migrations for the Nomad PostgreSQL
database, plus `migrate.py` (apply, roll back, check) and `verify.py` (check the
deployed schema). The nine application tables come from Section 5 of the
architecture design document.

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

## 4. Credentials

Connect with environment variables only:

```text
PGHOST PGUSER PGPASSWORD PGDATABASE PGSSLMODE PGSSLROOTCERT
```

Set the password without storing it anywhere:

```bash
read -rs PGPASSWORD && export PGPASSWORD
```

Credentials are never committed to the repo and never passed on the command
line. `.pgpass` and `*.pem` are in `.gitignore`.

TLS is required. Set:

```bash
export PGSSLMODE=verify-full
export PGSSLROOTCERT=$HOME/global-bundle.pem
```

The instance CA is `rds-ca-rsa2048-g1`. Download the AWS global bundle once:

```bash
curl -O https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
mv global-bundle.pem $HOME/global-bundle.pem
```

## 5. Pre-flight

Run these from the network that the security group allows. Security group
`sg-0b0e91786528e3f12` allows only `155.246.151.34/32` on port 5432, so the
deploy machine must come from that address.

Check the account:

```bash
AWS_PROFILE=bp2 aws sts get-caller-identity
# Account must be 904233098281
```

Check the instance:

```bash
AWS_PROFILE=bp2 aws rds describe-db-instances --db-instance-identifier db-nomad
# Status must be available
```

Take a snapshot before any change:

```bash
AWS_PROFILE=bp2 aws rds create-db-snapshot \
  --db-instance-identifier db-nomad \
  --db-snapshot-identifier db-nomad-pre-schema-$(date +%Y%m%d)
```

## 6. Run

```bash
export PGHOST=db-nomad.cjee06yueexr.us-east-1.rds.amazonaws.com PGUSER=nomad PGDATABASE=postgres
export PGSSLMODE=verify-full PGSSLROOTCERT=$HOME/global-bundle.pem
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

The constraint tests can run against the migrated RDS database and leave
nothing behind:

```bash
export PGHOST=db-nomad.cjee06yueexr.us-east-1.rds.amazonaws.com PGUSER=nomad PGDATABASE=postgres
export PGSSLMODE=verify-full PGSSLROOTCERT=$HOME/global-bundle.pem
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

Always take a snapshot first (Section 5).

1. **A migration fails.** Its transaction rolls back and the version is not
   recorded. Fix the file and re-run `up`. (Do not fix it by editing a version
   that already succeeded; add a new version instead.)
2. **Undo the newest version.** `uv run python migrations/migrate.py down --steps 1 --yes` (from `backend/`).
   This drops tables and data, so snapshot first.
3. **Data loss or a bad state.** Restore from the pre-migration snapshot into a
   NEW instance with `aws rds restore-db-instance-from-db-snapshot`, check it,
   then switch. Never delete `db-nomad`; deletion protection is on.
4. **`schema_migrations` and the schema disagree.** Run `check` and `verify`,
   then fix with a new forward migration.

## 9. Using another database name

Change `PGDATABASE`. No SQL changes are needed.

## 10. Connecting Lambdas later

Out of scope for now. The Lambdas are not in the VPC, so wiring them to RDS
needs separate work (VPC config, security group access, and a way to supply the
database credentials).
