"""Read-only checks that a database has the expected Nomad schema."""
from __future__ import annotations

import psycopg

EXPECTED_TABLES = {
    "users", "founder_profiles", "projects", "project_founders", "project_progress_state",
    "project_documents", "validation", "tasks", "nda_acceptances",
}

# (table, column, referenced table)
EXPECTED_FOREIGN_KEYS = {
    ("founder_profiles", "user_id", "users"),
    ("projects", "created_by_user_id", "users"),
    ("project_founders", "project_id", "projects"),
    ("project_founders", "founder_id", "founder_profiles"),
    ("project_progress_state", "project_id", "projects"),
    ("project_progress_state", "completed_by", "users"),
    ("project_documents", "project_id", "projects"),
    ("project_documents", "uploaded_by", "users"),
    ("validation", "project_id", "projects"),
    ("validation", "reviewer_id", "users"),
    ("validation", "updated_by", "users"),
    ("tasks", "project_id", "projects"),
    ("tasks", "created_by_id", "users"),
    ("tasks", "owner_id", "users"),
    ("tasks", "assigned_by_id", "users"),
    ("nda_acceptances", "user_id", "users"),
}

EXPECTED_INDEXES = {
    "users_pkey", "uq_users_cognito_sub",
    "founder_profiles_pkey", "uq_founder_profiles_user_id",
    "projects_pkey", "idx_projects_created_by_user_id", "idx_projects_status",
    "project_founders_pkey", "idx_project_founders_founder_id", "uq_project_founders_one_primary",
    "project_progress_state_pkey", "uq_progress_project_stage", "idx_progress_completed_by",
    "project_documents_pkey", "idx_project_documents_project_id", "idx_project_documents_uploaded_by",
    "validation_pkey", "uq_validation_project_id", "idx_validation_reviewer_id", "idx_validation_updated_by",
    "tasks_pkey", "idx_tasks_project_id", "idx_tasks_owner_id", "idx_tasks_assigned_by_id", "idx_tasks_created_by_id",
    "nda_acceptances_pkey", "uq_nda_user_version",
}

EXPECTED_CHECKS = {
    "ck_projects_support_type", "ck_projects_status", "ck_projects_funding_min_nonneg",
    "ck_projects_funding_max_nonneg", "ck_projects_funding_range", "ck_project_founders_role",
    "ck_progress_status", "ck_progress_dates", "ck_validation_verdict", "ck_validation_score",
    "ck_tasks_status", "ck_tasks_priority",
}

FK_SQL = """
SELECT c.conrelid::regclass::text, a.attname, c.confrelid::regclass::text
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
"""


def verify(conn: psycopg.Connection, migrations) -> list[str]:
    problems: list[str] = []

    tables = {r[0] for r in conn.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public'")}
    for t in sorted(EXPECTED_TABLES - tables):
        problems.append(f"missing table: {t}")

    fks = set(conn.execute(FK_SQL).fetchall())
    for fk in sorted(EXPECTED_FOREIGN_KEYS - fks):
        problems.append(f"missing foreign key: {fk[0]}.{fk[1]} -> {fk[2]}")

    indexes = {r[0] for r in conn.execute("SELECT indexname FROM pg_indexes WHERE schemaname='public'")}
    for i in sorted(EXPECTED_INDEXES - indexes):
        problems.append(f"missing index or unique constraint: {i}")

    checks = {r[0] for r in conn.execute(
        "SELECT conname FROM pg_constraint WHERE contype='c' AND connamespace='public'::regnamespace")}
    for ck in sorted(EXPECTED_CHECKS - checks):
        problems.append(f"missing check constraint: {ck}")

    try:
        latest = conn.execute("SELECT max(version) FROM schema_migrations").fetchone()[0]
    except psycopg.errors.UndefinedTable:
        latest = None
    expected_latest = migrations[-1].version
    if latest != expected_latest:
        problems.append(f"database version {latest} is not the latest repository version {expected_latest}")
    return problems
