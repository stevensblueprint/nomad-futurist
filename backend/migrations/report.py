"""Read-only dump of the public schema as deterministic JSON plus a hash.

`build_report(conn)` describes the whole ``public`` schema (tables, columns,
constraints, indexes, triggers, functions) and the applied migration checksums
in a way that is identical for any two databases built from the same migration
files, no matter their name, owner, or OIDs. Everything runs inside a
read-only transaction and nothing is created or changed.

The returned dict is:

    {
      "hash": "<sha256 hex of the canonical JSON of {'schema', 'migrations'}>",
      "schema": {
        "tables": { "<table>": {
            "columns":     [ {"name","type","not_null","default","identity","generated"} ],
            "constraints": [ {"name","type","definition","validated"} ],
            "indexes":     [ {"name","definition"} ],
            "triggers":    [ {"name","definition"} ],
        } },
        "functions": { "<name>": "<pg_get_functiondef text>" },
      },
      "migrations": [ {"version","name","checksum"} ],
      "row_counts": { "<table>": <int> },
      "server":     { "major_version": <int> },
    }

Owners, ACLs, OIDs, tablespaces, the ``schema_migrations.applied_at``
timestamp, and the server version are deliberately excluded from the hash
(and mostly from the report) because the local server and RDS have different
role names and OIDs. ``row_counts`` and ``server`` are not part of the hash.
"""
from __future__ import annotations

import hashlib
import json

import psycopg
from psycopg import sql

# pg_constraint.contype -> readable name. NOT NULL constraints (contype 'n')
# are excluded: NOT NULL is already captured per column via attnotnull.
CONSTRAINT_TYPES = {"p": "primary", "u": "unique", "f": "foreign", "c": "check"}

_EXTENSION_MEMBER = """
NOT EXISTS (
    SELECT 1 FROM pg_depend d
    WHERE d.classid = {cls}::regclass
      AND d.objid = {obj}
      AND d.refclassid = 'pg_extension'::regclass
      AND d.deptype = 'e'
)
"""

TABLES_SQL = f"""
SELECT c.oid, c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND {_EXTENSION_MEMBER.format(cls="'pg_class'", obj="c.oid")}
ORDER BY c.relname
"""

COLUMNS_SQL = """
SELECT a.attname,
       format_type(a.atttypid, a.atttypmod),
       a.attnotnull,
       pg_get_expr(d.adbin, d.adrelid),
       a.attidentity,
       a.attgenerated
FROM pg_attribute a
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attrelid = %s AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum
"""

CONSTRAINTS_SQL = """
SELECT conname, contype, pg_get_constraintdef(oid), convalidated
FROM pg_constraint
WHERE conrelid = %s AND connamespace = 'public'::regnamespace
  AND contype IN ('p', 'u', 'f', 'c')
ORDER BY conname
"""

INDEXES_SQL = """
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = %s
ORDER BY indexname
"""

TRIGGERS_SQL = """
SELECT t.tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger t
WHERE t.tgrelid = %s AND NOT t.tgisinternal
ORDER BY t.tgname
"""

FUNCTIONS_SQL = f"""
SELECT p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND {_EXTENSION_MEMBER.format(cls="'pg_proc'", obj="p.oid")}
ORDER BY p.proname
"""

MIGRATIONS_SQL = "SELECT version, name, checksum FROM schema_migrations ORDER BY version"


def _char(value: str) -> str:
    """psycopg maps the one-byte ``"char"`` type to a (possibly empty) str."""
    return value or ""


def build_report(conn: psycopg.Connection) -> dict:
    """Build the report. Read-only; never writes and never creates the tracking table."""
    with conn.transaction():
        conn.execute("SET TRANSACTION READ ONLY")
        schema = _schema(conn)
        migrations = _migrations(conn, schema)
        row_counts = _row_counts(conn, schema)
        server = _server(conn)

    canonical = json.dumps(
        {"schema": schema, "migrations": migrations},
        sort_keys=True,
        separators=(",", ":"),
    )
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return {
        "hash": digest,
        "schema": schema,
        "migrations": migrations,
        "row_counts": row_counts,
        "server": server,
    }


def _schema(conn: psycopg.Connection) -> dict:
    tables: dict = {}
    for oid, name in conn.execute(TABLES_SQL).fetchall():
        tables[name] = {
            "columns": [
                {
                    "name": c_name,
                    "type": c_type,
                    "not_null": not_null,
                    "default": default,
                    "identity": _char(identity),
                    "generated": _char(generated),
                }
                for c_name, c_type, not_null, default, identity, generated in
                conn.execute(COLUMNS_SQL, (oid,)).fetchall()
            ],
            "constraints": [
                {
                    "name": conname,
                    "type": CONSTRAINT_TYPES[contype],
                    "definition": definition,
                    "validated": validated,
                }
                for conname, contype, definition, validated in
                conn.execute(CONSTRAINTS_SQL, (oid,)).fetchall()
            ],
            "indexes": [
                {"name": indexname, "definition": indexdef}
                for indexname, indexdef in conn.execute(INDEXES_SQL, (name,)).fetchall()
            ],
            "triggers": [
                {"name": tgname, "definition": tgdef}
                for tgname, tgdef in conn.execute(TRIGGERS_SQL, (oid,)).fetchall()
            ],
        }
    functions = {name: definition for name, definition in conn.execute(FUNCTIONS_SQL).fetchall()}
    return {"tables": tables, "functions": functions}


def _migrations(conn: psycopg.Connection, schema: dict) -> list[dict]:
    if "schema_migrations" not in schema["tables"]:
        return []
    return [
        {"version": version, "name": name, "checksum": checksum}
        for version, name, checksum in conn.execute(MIGRATIONS_SQL).fetchall()
    ]


def _row_counts(conn: psycopg.Connection, schema: dict) -> dict:
    counts: dict = {}
    for table in schema["tables"]:
        query = sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(table))
        counts[table] = conn.execute(query).fetchone()[0]
    return counts


def _server(conn: psycopg.Connection) -> dict:
    version_num = conn.execute("SELECT current_setting('server_version_num')::int").fetchone()[0]
    return {"major_version": version_num // 10000}
