"""Conformance test: the migrated schema matches Section 5 of the design doc and
the structural requirements of issue #44.

Section 5 (docs/database/arch.md, lines 297-376) is transcribed here
independently as test data. Every place where the real schema differs from the
doc is recorded explicitly in DEVIATIONS with a reason, and the tests assert
that the actual catalog equals those recorded values, so any unlisted or
changed difference fails.

The tests only read the catalog, so they run against any migrated database:
locally, and through the Lambda ``integrity`` action on RDS (the ``conn``
fixture is a transaction that is always rolled back).
"""
from __future__ import annotations

import re

import pytest

# ---------------------------------------------------------------------------
# Section 5, transcribed independently.  Each entry is
#     table -> ordered list of (column, spec_type, spec_not_null)
# where ``spec_type`` is the *intended* PostgreSQL type (Section 5 typos are
# fixed here and recorded in DEVIATIONS["type"]), and ``spec_not_null`` is True
# only when the doc says NOT NULL or the column is a primary key (which is
# implicitly NOT NULL).  Everything else is "unspecified" and may be nullable
# unless a DEVIATIONS["not_null"] entry makes it NOT NULL.
# ---------------------------------------------------------------------------
SECTION5_TABLES: dict[str, list[tuple[str, str, bool]]] = {
    "users": [
        ("user_id", "uuid", True),
        ("cognito_sub", "text", True),
        ("name", "text", False),
        ("email", "text", True),
        ("created_at", "timestamp with time zone", True),
        ("updated_at", "timestamp with time zone", True),
    ],
    "founder_profiles": [
        ("founder_id", "uuid", True),
        ("user_id", "uuid", True),
        ("address", "text", False),
        ("phone", "character varying(32)", False),
        ("linkedin_url", "text", False),
    ],
    "projects": [
        ("project_id", "uuid", True),
        ("created_by_user_id", "uuid", False),
        ("project_name", "text", True),
        ("description", "text", True),
        ("support_type", "text", True),
        ("needs", "text", True),
        ("funding_min", "numeric(14,2)", False),
        ("funding_max", "numeric(14,2)", False),
        ("status", "character varying", True),
        ("submitted_at", "timestamp with time zone", False),
        ("created_at", "timestamp with time zone", False),
        ("updated_at", "timestamp with time zone", False),
    ],
    "project_founders": [
        ("project_id", "uuid", True),
        ("founder_id", "uuid", True),
        ("founder_role", "character varying", True),
        ("joined_at", "timestamp with time zone", True),
    ],
    "project_progress_state": [
        ("state_id", "uuid", True),
        ("project_id", "uuid", False),
        ("stage_id", "character varying", False),
        ("status", "character varying", False),
        ("started_at", "timestamp with time zone", False),
        ("completed_at", "timestamp with time zone", False),
        ("completed_by", "uuid", False),
    ],
    "project_documents": [
        ("document_id", "uuid", True),
        ("project_id", "uuid", True),
        ("uploaded_by", "uuid", True),
        ("document_type", "text", True),
        ("s3_key", "text", True),
        ("original_filename", "text", False),
        ("uploaded_at", "timestamp with time zone", True),
    ],
    "validation": [
        ("validation_id", "uuid", True),
        ("project_id", "uuid", True),
        ("reviewer_id", "uuid", True),
        ("updated_by", "uuid", False),
        ("verdict", "text", True),
        ("feedback", "text", True),
        ("probing_questions", "text", True),
        ("next_steps", "text", True),
        ("score", "smallint", False),
        ("created_at", "timestamp with time zone", True),
        ("updated_at", "timestamp with time zone", True),
    ],
    "tasks": [
        ("task_id", "uuid", True),
        ("project_id", "uuid", True),
        ("created_by_id", "uuid", True),
        ("owner_id", "uuid", False),
        ("assigned_by_id", "uuid", False),
        ("title", "text", True),
        ("description", "text", False),
        ("priority", "text", False),
        ("status", "text", True),
        ("assigned_at", "timestamp with time zone", False),
        ("due_at", "timestamp with time zone", False),
        ("completed_at", "timestamp with time zone", False),
        ("reminder_enabled", "boolean", True),
    ],
    "nda_acceptances": [
        ("nda_acceptance_id", "uuid", True),
        ("user_id", "uuid", False),
        ("nda_version", "text", True),
        ("accepted_at", "timestamp with time zone", False),
    ],
}

# Foreign keys exactly as Section 5 lists them: (table, column, ref_table, ref_column).
SECTION5_FKS: list[tuple[str, str, str, str]] = [
    ("founder_profiles", "user_id", "users", "user_id"),
    ("projects", "created_by_user_id", "founder_profiles", "founder_id"),
    ("project_founders", "project_id", "projects", "project_id"),
    ("project_founders", "founder_id", "founder_profiles", "founder_id"),
    ("project_progress_state", "project_id", "projects", "project_id"),
    ("project_progress_state", "completed_by", "users", "user_id"),
    ("project_documents", "project_id", "projects", "project_id"),
    ("project_documents", "uploaded_by", "users", "user_id"),
    ("validation", "project_id", "projects", "project_id"),
    ("validation", "reviewer_id", "users", "user_id"),
    ("validation", "updated_by", "users", "user_id"),
    ("tasks", "project_id", "projects", "project_id"),
    ("tasks", "created_by_id", "users", "user_id"),
    ("tasks", "owner_id", "users", "user_id"),
    ("tasks", "assigned_by_id", "users", "user_id"),
    ("nda_acceptances", "user_id", "users", "user_id"),
]

# Single-column primary keys Section 5 states (via "pk").  project_founders has
# no pk in the doc and is recorded in DEVIATIONS["primary_key"].
SECTION5_PKS: dict[str, str] = {
    "users": "user_id",
    "founder_profiles": "founder_id",
    "projects": "project_id",
    "project_progress_state": "state_id",
    "project_documents": "document_id",
    "validation": "validation_id",
    "tasks": "task_id",
    "nda_acceptances": "nda_acceptance_id",
}

# Unique constraints Section 5 states: table -> tuple of columns.
SECTION5_UNIQUE: dict[str, tuple[str, ...]] = {
    "users": ("cognito_sub",),
    "validation": ("project_id",),
}

# Defaults Section 5 states, as pg_get_expr renders them.
SECTION5_DEFAULTS: dict[tuple[str, str], str] = {
    ("project_founders", "founder_role"): "'cofounder'::text",
    ("project_founders", "joined_at"): "now()",
    ("tasks", "reminder_enabled"): "false",
}


# ---------------------------------------------------------------------------
# Every deviation from Section 5, each with a reason.  The tests assert that the
# actual catalog equals these recorded values, so an unlisted or changed
# difference fails.
# ---------------------------------------------------------------------------
DEVIATIONS: dict[str, dict] = {
    "type": {
        ("users", "name"): {
            "spec": "VARCHAR TEXT",
            "actual": "text",
            "reason": "Section 5 typo 'VARCHAR TEXT' read as plain text",
        },
        ("founder_profiles", "linkedin_url"): {
            "spec": "TECT",
            "actual": "text",
            "reason": "Section 5 typo 'TECT' read as text",
        },
        ("nda_acceptances", "accepted_at"): {
            "spec": "TIMESTAMPZ",
            "actual": "timestamp with time zone",
            "reason": "Section 5 typo 'TIMESTAMPZ' read as timestamptz",
        },
        ("tasks", "created_by_id"): {
            "spec": "<no type in doc>",
            "actual": "uuid",
            "reason": "Section 5 omits the type; issue #44 requires a users FK, so uuid",
        },
        ("projects", "support_type"): {
            "spec": "TEXT then VARCHAR (listed twice)",
            "actual": "text",
            "reason": "Section 5 lists support_type twice (TEXT and VARCHAR); a single text column",
        },
        ("projects", "status"): {
            "spec": "character varying",
            "actual": "text",
            "reason": "free-length varchar and text are equivalent in PostgreSQL; CHECK constraints control values",
        },
        ("project_founders", "founder_role"): {
            "spec": "character varying",
            "actual": "text",
            "reason": "free-length varchar and text are equivalent in PostgreSQL; CHECK constraints control values",
        },
    },
    "not_null": {
        ("projects", "created_at"): {
            "reason": "Section 5 is silent; the migration sets NOT NULL DEFAULT now()",
        },
        ("projects", "updated_at"): {
            "reason": "Section 5 is silent; the migration sets NOT NULL DEFAULT now()",
        },
        ("project_progress_state", "project_id"): {
            "reason": "Section 5 is silent; a progress row must belong to a project",
        },
        ("project_progress_state", "stage_id"): {
            "reason": "Section 5 is silent; a progress row must name its stage",
        },
        ("project_progress_state", "status"): {
            "reason": "Section 5 is silent; a progress row must have a status",
        },
        ("nda_acceptances", "user_id"): {
            "reason": "Section 5 is silent; an acceptance must belong to a user",
        },
        ("nda_acceptances", "accepted_at"): {
            "reason": "Section 5 is silent; the acceptance timestamp is always set",
        },
    },
    "default": {
        ("users", "user_id"): {"actual": "gen_random_uuid()", "reason": "uuid primary key default (issue #44)"},
        ("users", "created_at"): {"actual": "now()", "reason": "Section 5 is silent; created timestamp"},
        ("users", "updated_at"): {"actual": "now()", "reason": "Section 5 is silent; updated timestamp"},
        ("founder_profiles", "founder_id"): {"actual": "gen_random_uuid()", "reason": "uuid primary key default (issue #44)"},
        ("projects", "project_id"): {"actual": "gen_random_uuid()", "reason": "uuid primary key default (issue #44)"},
        ("projects", "status"): {"actual": "'draft'::text", "reason": "new projects start in draft (issue #44)"},
        ("projects", "created_at"): {"actual": "now()", "reason": "Section 5 is silent; created timestamp"},
        ("projects", "updated_at"): {"actual": "now()", "reason": "Section 5 is silent; updated timestamp"},
        ("project_progress_state", "state_id"): {"actual": "gen_random_uuid()", "reason": "uuid primary key default (issue #44)"},
        ("project_progress_state", "status"): {"actual": "'not_started'::character varying", "reason": "new progress states start not_started (issue #44)"},
        ("project_documents", "document_id"): {"actual": "gen_random_uuid()", "reason": "uuid primary key default (issue #44)"},
        ("project_documents", "uploaded_at"): {"actual": "now()", "reason": "Section 5 is silent; upload timestamp"},
        ("validation", "validation_id"): {"actual": "gen_random_uuid()", "reason": "uuid primary key default (issue #44)"},
        ("validation", "created_at"): {"actual": "now()", "reason": "Section 5 is silent; created timestamp"},
        ("validation", "updated_at"): {"actual": "now()", "reason": "Section 5 is silent; updated timestamp"},
        ("tasks", "task_id"): {"actual": "gen_random_uuid()", "reason": "uuid primary key default (issue #44)"},
        ("tasks", "status"): {"actual": "'request_submitted'::text", "reason": "new tasks start request_submitted (issue #44)"},
        ("nda_acceptances", "nda_acceptance_id"): {"actual": "gen_random_uuid()", "reason": "uuid primary key default (issue #44)"},
        ("nda_acceptances", "accepted_at"): {"actual": "now()", "reason": "Section 5 is silent; acceptance timestamp"},
    },
    "unique": {
        ("founder_profiles", ("user_id",)): {
            "reason": "Section 5 does not state it; one founder profile per user (issue #44)",
        },
        ("project_progress_state", ("project_id", "stage_id")): {
            "reason": "Section 5 does not state it; one progress state per project stage",
        },
        ("nda_acceptances", ("user_id", "nda_version")): {
            "reason": "Section 5 does not state it; one acceptance per user per NDA version",
        },
    },
    "primary_key": {
        "project_founders": {
            "actual": ("project_id", "founder_id"),
            "reason": "Section 5 lists no pk; the composite key enforces one row per founder per project",
        },
    },
    "foreign_key": {
        ("projects", "created_by_user_id"): {
            "spec": ("founder_profiles", "founder_id"),
            "actual": ("users", "user_id"),
            "reason": "user decision: the project creator is a user, so the FK targets users.user_id, not founder_profiles.founder_id",
        },
    },
    "check": {
        "ck_projects_support_type": {"table": "projects", "reason": "Section 5 lists no CHECKs; issue #44 value set"},
        "ck_projects_status": {"table": "projects", "reason": "Section 5 lists no CHECKs; issue #44 value set"},
        "ck_projects_funding_min_nonneg": {"table": "projects", "reason": "Section 5 lists no CHECKs; issue #44 non-negative funding"},
        "ck_projects_funding_max_nonneg": {"table": "projects", "reason": "Section 5 lists no CHECKs; issue #44 non-negative funding"},
        "ck_projects_funding_range": {"table": "projects", "reason": "Section 5 lists no CHECKs; issue #44 funding_min <= funding_max"},
        "ck_project_founders_role": {"table": "project_founders", "reason": "Section 5 lists no CHECKs; issue #44 value set"},
        "ck_progress_status": {"table": "project_progress_state", "reason": "Section 5 lists no CHECKs; issue #44 value set"},
        "ck_progress_dates": {"table": "project_progress_state", "reason": "Section 5 lists no CHECKs; completed_at >= started_at"},
        "ck_validation_verdict": {"table": "validation", "reason": "Section 5 lists no CHECKs; issue #44 value set"},
        "ck_validation_score": {"table": "validation", "reason": "Section 5 lists no CHECKs; issue #44 score 1..10"},
        "ck_tasks_status": {"table": "tasks", "reason": "Section 5 lists no CHECKs; issue #44 value set"},
        "ck_tasks_priority": {"table": "tasks", "reason": "Section 5 lists no CHECKs; issue #44 value set"},
    },
    "trigger": {
        "trg_users_updated_at": {"table": "users", "reason": "Section 5 does not state it; keeps users.updated_at current"},
        "trg_projects_updated_at": {"table": "projects", "reason": "Section 5 does not state it; keeps projects.updated_at current"},
        "trg_validation_updated_at": {"table": "validation", "reason": "Section 5 does not state it; keeps validation.updated_at current"},
    },
    "function": {
        "set_updated_at": {"reason": "Section 5 does not state it; used by the three updated_at triggers"},
    },
    "extra_table": {
        "schema_migrations": {"reason": "migration runner bookkeeping, not an application table"},
    },
}

# Foreign keys that cascade on delete: every reference to projects cascades, so
# deleting a project removes its dependent rows.
CASCADE_FKS: set[tuple[str, str]] = {
    ("project_founders", "project_id"),
    ("project_progress_state", "project_id"),
    ("project_documents", "project_id"),
    ("validation", "project_id"),
    ("tasks", "project_id"),
}

# The uuid primary-key columns (issue #44: every one defaults to gen_random_uuid()).
UUID_PK_COLUMNS: list[tuple[str, str]] = [
    ("users", "user_id"),
    ("founder_profiles", "founder_id"),
    ("projects", "project_id"),
    ("project_progress_state", "state_id"),
    ("project_documents", "document_id"),
    ("validation", "validation_id"),
    ("tasks", "task_id"),
    ("nda_acceptances", "nda_acceptance_id"),
]

# issue #44: the exact value list each CHECK constraint must allow.
# (table, column) -> (constraint name, set of allowed values)
CHECK_VALUE_LISTS: dict[tuple[str, str], tuple[str, set[str]]] = {
    ("projects", "support_type"): ("ck_projects_support_type", {"funding", "human_capital", "both"}),
    ("projects", "status"): ("ck_projects_status", {"draft", "pending", "under_review", "approved", "declined", "archived"}),
    ("project_founders", "founder_role"): ("ck_project_founders_role", {"primary", "cofounder"}),
    ("project_progress_state", "status"): ("ck_progress_status", {"not_started", "in_progress", "completed"}),
    ("validation", "verdict"): ("ck_validation_verdict", {"approved", "needs_revision", "declined"}),
    ("tasks", "status"): ("ck_tasks_status", {"request_submitted", "under_review", "unassigned", "assigned", "in_progress", "blocked", "completed", "cancelled"}),
    ("tasks", "priority"): ("ck_tasks_priority", {"critical", "standard"}),
}

# issue #44: indexes whose FIRST key column must be the given column (checked via
# pg_index/pg_attribute, not by name).
REQUIRED_LEADING_INDEXES: list[tuple[str, str]] = [
    ("projects", "created_by_user_id"),  # ownership lookups
    ("projects", "status"),              # status filter
    ("validation", "reviewer_id"),       # reviewer lookup
    ("tasks", "owner_id"),               # task assignment
    ("tasks", "assigned_by_id"),         # task assignment
    ("tasks", "project_id"),             # task assignment
    ("project_founders", "founder_id"),  # founder's projects
]


# ---------------------------------------------------------------------------
# Read-only catalog helpers.
# ---------------------------------------------------------------------------
_COLUMNS_SQL = """
SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull,
       pg_get_expr(d.adbin, d.adrelid)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY c.relname, a.attnum
"""

_PK_SQL = """
SELECT c.relname, a.attname
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
WHERE n.nspname = 'public' AND con.contype = '{kind}'
ORDER BY c.relname, k.ord
"""

_FK_SQL = """
SELECT c.relname, a.attname, fc.relname, fa.attname, con.confdeltype
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = con.conkey[1]
JOIN pg_class fc ON fc.oid = con.confrelid
JOIN pg_attribute fa ON fa.attrelid = fc.oid AND fa.attnum = con.confkey[1]
WHERE n.nspname = 'public' AND con.contype = 'f'
ORDER BY c.relname, a.attname
"""

_CHECK_SQL = """
SELECT con.conname, c.relname, pg_get_constraintdef(con.oid, true)
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND con.contype = 'c'
ORDER BY con.conname
"""

_INDEX_SQL = """
SELECT ic.relname, t.relname, i.indisunique, i.indisprimary,
       pg_get_expr(i.indpred, i.indrelid), a.attname
FROM pg_index i
JOIN pg_class t ON t.oid = i.indrelid
JOIN pg_class ic ON ic.oid = i.indexrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
JOIN unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord) ON true
LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
WHERE n.nspname = 'public'
ORDER BY ic.relname, k.ord
"""

_TRIGGER_SQL = """
SELECT tgname, c.relname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
ORDER BY tgname
"""

_FUNCTION_SQL = """
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname
"""

_DELETE_RULES = {"a": "NO ACTION", "r": "RESTRICT", "c": "CASCADE", "n": "SET NULL", "d": "SET DEFAULT"}
_QUOTED = re.compile(r"'([^']*)'")


def _tables(conn) -> set[str]:
    rows = conn.execute(
        "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
        "WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname"
    ).fetchall()
    return {r[0] for r in rows}


def _columns(conn) -> dict[str, list[dict]]:
    cols: dict[str, list[dict]] = {}
    for relname, attname, ftype, not_null, default in conn.execute(_COLUMNS_SQL).fetchall():
        cols.setdefault(relname, []).append(
            {"name": attname, "type": ftype, "not_null": not_null, "default": default}
        )
    return cols


def _constraint_columns(conn, kind: str) -> dict[str, tuple[str, ...]]:
    result: dict[str, tuple[str, ...]] = {}
    for relname, attname in conn.execute(_PK_SQL.format(kind=kind)).fetchall():
        result[relname] = result.get(relname, ()) + (attname,)
    return result


def _foreign_keys(conn) -> dict[tuple[str, str], tuple[str, str, str]]:
    result: dict[tuple[str, str], tuple[str, str, str]] = {}
    for relname, attname, ref_rel, ref_att, rule in conn.execute(_FK_SQL).fetchall():
        result[(relname, attname)] = (ref_rel, ref_att, _DELETE_RULES[rule])
    return result


def _check_constraints(conn) -> dict[str, tuple[str, str]]:
    return {name: (relname, definition) for name, relname, definition in conn.execute(_CHECK_SQL).fetchall()}


def _indexes(conn) -> dict[str, dict]:
    result: dict[str, dict] = {}
    for name, relname, unique, primary, pred, attname in conn.execute(_INDEX_SQL).fetchall():
        d = result.setdefault(name, {
            "table": relname, "columns": [], "unique": unique, "primary": primary, "predicate": pred,
        })
        if attname is not None:
            d["columns"].append(attname)
    return result


def _triggers(conn) -> dict[str, str]:
    return {name: relname for name, relname in conn.execute(_TRIGGER_SQL).fetchall()}


def _functions(conn) -> set[str]:
    return {r[0] for r in conn.execute(_FUNCTION_SQL).fetchall()}


def _leading_indexes(conn) -> dict[tuple[str, str], set[str]]:
    """(table, column) -> names of indexes whose first key column is that column."""
    result: dict[tuple[str, str], set[str]] = {}
    for name, info in _indexes(conn).items():
        if info["columns"]:
            result.setdefault((info["table"], info["columns"][0]), set()).add(name)
    return result


def _section5_columns() -> list[tuple[str, str]]:
    return [(table, name) for table, cols in SECTION5_TABLES.items() for name, _, _ in cols]


# ---------------------------------------------------------------------------
# C.1  Public tables: the nine Section 5 tables plus schema_migrations.
# ---------------------------------------------------------------------------
def test_public_tables_match_section5_plus_schema_migrations(conn):
    expected = set(SECTION5_TABLES) | set(DEVIATIONS["extra_table"])
    assert _tables(conn) == expected, (
        f"public tables differ: expected {sorted(expected)}, got {sorted(_tables(conn))}"
    )


# ---------------------------------------------------------------------------
# C.2  Column names and order.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("table", list(SECTION5_TABLES))
def test_column_names_and_order(conn, table):
    expected = [name for name, _, _ in SECTION5_TABLES[table]]
    actual = [c["name"] for c in _columns(conn)[table]]
    assert actual == expected, (
        f"{table}: column names/order differ; expected {expected}, got {actual}"
    )


# ---------------------------------------------------------------------------
# C.3  Data types.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("table,column", _section5_columns())
def test_column_types(conn, table, column):
    spec_type = dict((c, t) for c, t, _ in SECTION5_TABLES[table])[column]
    deviation = DEVIATIONS["type"].get((table, column))
    expected = deviation["actual"] if deviation else spec_type
    actual = next(c["type"] for c in _columns(conn)[table] if c["name"] == column)
    assert actual == expected, (
        f"{table}.{column}: type is {actual!r}, expected {expected!r} "
        f"(Section 5 says {spec_type!r}{' but ' + deviation['reason'] if deviation else ''})"
    )


# ---------------------------------------------------------------------------
# C.4  Nullability.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("table,column", _section5_columns())
def test_column_nullability(conn, table, column):
    spec_not_null = dict((c, n) for c, _, n in SECTION5_TABLES[table])[column]
    deviation = DEVIATIONS["not_null"].get((table, column))
    expected_not_null = spec_not_null or (deviation is not None)
    actual = next(c["not_null"] for c in _columns(conn)[table] if c["name"] == column)
    assert bool(actual) is expected_not_null, (
        f"{table}.{column}: nullability is {'NOT NULL' if actual else 'nullable'}, "
        f"expected {'NOT NULL' if expected_not_null else 'nullable'}"
    )


# ---------------------------------------------------------------------------
# C.5  Defaults.
# ---------------------------------------------------------------------------
def test_defaults(conn):
    columns = _columns(conn)
    actual = {
        (table, c["name"]): c["default"]
        for table in SECTION5_TABLES
        for c in columns[table]
        if c["default"] is not None
    }

    for key, expr in SECTION5_DEFAULTS.items():
        assert actual.get(key) == expr, (
            f"{key[0]}.{key[1]}: default is {actual.get(key)!r}, expected {expr!r} (Section 5 default)"
        )

    for key, deviation in DEVIATIONS["default"].items():
        assert actual.get(key) == deviation["actual"], (
            f"{key[0]}.{key[1]}: default is {actual.get(key)!r}, expected {deviation['actual']!r} "
            f"({deviation['reason']})"
        )

    expected = set(SECTION5_DEFAULTS) | set(DEVIATIONS["default"])
    assert set(actual) == expected, (
        f"unexpected defaults: expected {sorted(expected)}, got {sorted(actual)}"
    )


# ---------------------------------------------------------------------------
# C.6  Primary keys.
# ---------------------------------------------------------------------------
def test_primary_keys(conn):
    pks = _constraint_columns(conn, "p")
    for table, column in SECTION5_PKS.items():
        assert pks.get(table) == (column,), (
            f"{table}: primary key is {pks.get(table)!r}, expected ({column!r},)"
        )
    deviation = DEVIATIONS["primary_key"]["project_founders"]
    assert pks.get("project_founders") == deviation["actual"], (
        f"project_founders: primary key is {pks.get('project_founders')!r}, "
        f"expected {deviation['actual']!r} ({deviation['reason']})"
    )


# ---------------------------------------------------------------------------
# C.7  Foreign keys (including the recorded deviation and the delete rules).
# ---------------------------------------------------------------------------
def test_foreign_keys(conn):
    expected: dict[tuple[str, str], tuple[str, str, str]] = {}
    for table, column, ref_table, ref_column in SECTION5_FKS:
        deviation = DEVIATIONS["foreign_key"].get((table, column))
        if deviation:
            ref_table, ref_column = deviation["actual"]
        rule = "CASCADE" if (table, column) in CASCADE_FKS else "RESTRICT"
        expected[(table, column)] = (ref_table, ref_column, rule)

    actual = _foreign_keys(conn)
    assert set(actual) == set(expected), (
        f"foreign keys differ: expected {sorted(expected)}, got {sorted(actual)}"
    )
    for key, (ref_table, ref_column, rule) in expected.items():
        assert actual[key] == (ref_table, ref_column, rule), (
            f"{key[0]}.{key[1]}: FK is {actual[key]!r}, expected {(ref_table, ref_column, rule)!r}"
        )


# ---------------------------------------------------------------------------
# C.8  Unique constraints.
# ---------------------------------------------------------------------------
def test_unique_constraints(conn):
    expected: dict[str, tuple[str, ...]] = dict(SECTION5_UNIQUE)
    for (table, columns) in DEVIATIONS["unique"]:
        expected[table] = columns
    actual = _constraint_columns(conn, "u")
    assert actual == expected, (
        f"unique constraints differ: expected {expected}, got {actual}"
    )


# ---------------------------------------------------------------------------
# C.9  Issue #44 structural requirements.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("table,column", UUID_PK_COLUMNS)
def test_uuid_primary_keys_default_to_gen_random_uuid(conn, table, column):
    actual = next(c["default"] for c in _columns(conn)[table] if c["name"] == column)
    assert actual == "gen_random_uuid()", (
        f"{table}.{column}: uuid pk default is {actual!r}, expected 'gen_random_uuid()'"
    )


def test_support_type_check_allows_exactly_three_values(conn):
    definition = _check_constraints(conn)["ck_projects_support_type"][1]
    assert _QUOTED.findall(definition) == ["funding", "human_capital", "both"], (
        f"projects.support_type CHECK allows wrong set: {definition}"
    )


def test_funding_checks(conn):
    checks = _check_constraints(conn)

    min_def = checks["ck_projects_funding_min_nonneg"][1]
    assert "funding_min" in min_def and ">= 0" in min_def, (
        f"ck_projects_funding_min_nonneg wrong: {min_def}"
    )

    max_def = checks["ck_projects_funding_max_nonneg"][1]
    assert "funding_max" in max_def and ">= 0" in max_def, (
        f"ck_projects_funding_max_nonneg wrong: {max_def}"
    )

    range_def = checks["ck_projects_funding_range"][1]
    assert "funding_min <= funding_max" in range_def, (
        f"ck_projects_funding_range wrong: {range_def}"
    )


def test_validation_unique_project_id_and_score_check(conn):
    actual = _constraint_columns(conn, "u").get("validation")
    assert actual == ("project_id",), (
        f"validation: unique constraint is {actual!r}, expected exactly UNIQUE(project_id)"
    )
    score_def = _check_constraints(conn)["ck_validation_score"][1]
    assert "score >= 1" in score_def and "score <= 10" in score_def, (
        f"ck_validation_score wrong: {score_def}"
    )


@pytest.mark.parametrize("key", list(CHECK_VALUE_LISTS))
def test_check_value_lists(conn, key):
    table, column = key
    conname, expected_values = CHECK_VALUE_LISTS[key]
    definition = _check_constraints(conn)[conname][1]
    actual_values = set(_QUOTED.findall(definition))
    assert actual_values == expected_values, (
        f"{table}.{column}: {conname} allows {sorted(actual_values)}, expected {sorted(expected_values)}"
    )


def test_partial_unique_index_one_primary_founder(conn):
    info = _indexes(conn).get("uq_project_founders_one_primary")
    assert info is not None, "uq_project_founders_one_primary index is missing"
    assert info["table"] == "project_founders", info
    assert info["unique"] and not info["primary"], info
    assert info["columns"] == ["project_id"], info
    assert info["predicate"] is not None and "founder_role" in info["predicate"] and "primary" in info["predicate"], (
        f"partial index predicate wrong: {info['predicate']!r}"
    )


@pytest.mark.parametrize("table,column", REQUIRED_LEADING_INDEXES)
def test_required_leading_indexes(conn, table, column):
    leading = _leading_indexes(conn)
    assert (table, column) in leading, (
        f"no index leads with {table}.{column} "
        f"(leading indexes: {sorted((t, c) for (t, c) in leading)})"
    )


def test_every_fk_column_has_a_leading_index(conn):
    leading = _leading_indexes(conn)
    for table, column in _foreign_keys(conn):
        assert (table, column) in leading, (
            f"foreign key column {table}.{column} has no index (or pk/unique) leading with it"
        )


def test_project_founders_many_to_many(conn):
    fks = _foreign_keys(conn)
    assert ("project_founders", "project_id") in fks, "project_founders -> projects FK missing"
    assert ("project_founders", "founder_id") in fks, "project_founders -> founder_profiles FK missing"
    assert fks[("project_founders", "project_id")][:2] == ("projects", "project_id"), fks
    assert fks[("project_founders", "founder_id")][:2] == ("founder_profiles", "founder_id"), fks
    assert _constraint_columns(conn, "p").get("project_founders") == ("project_id", "founder_id"), (
        "project_founders must have the composite primary key (project_id, founder_id)"
    )


# ---------------------------------------------------------------------------
# Extra constraints the doc does not mention: check set, triggers, function.
# ---------------------------------------------------------------------------
def test_check_constraint_set_is_exactly_expected(conn):
    expected = set(DEVIATIONS["check"])
    actual = set(_check_constraints(conn))
    assert actual == expected, (
        f"check constraints differ: expected {sorted(expected)}, got {sorted(actual)}"
    )


def test_updated_at_triggers_and_helper_function(conn):
    expected = {name: d["table"] for name, d in DEVIATIONS["trigger"].items()}
    assert _triggers(conn) == expected, (
        f"triggers differ: expected {expected}, got {_triggers(conn)}"
    )
    assert _functions(conn) == set(DEVIATIONS["function"]), (
        f"public functions differ: expected {set(DEVIATIONS['function'])}, got {_functions(conn)}"
    )
