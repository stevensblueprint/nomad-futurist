from __future__ import annotations

import psycopg
import pytest
from psycopg import errors

from conftest import insert_founder, insert_project, insert_user


def expect(exc, conn, sql, params=None):
    """Run a statement that must fail. A savepoint keeps the outer transaction usable."""
    with pytest.raises(exc):
        with conn.transaction():
            conn.execute(sql, params)


# ---- users, founder_profiles -------------------------------------------------

def test_create_user_and_founder_profile(conn):
    uid = insert_user(conn, name="Ada")
    fid = insert_founder(conn, uid)
    row = conn.execute(
        "SELECT u.name, f.phone, u.created_at IS NOT NULL FROM founder_profiles f "
        "JOIN users u USING (user_id) WHERE f.founder_id = %s", (fid,)).fetchone()
    assert row == ("Ada", "555-0100", True)


def test_cognito_sub_unique(conn):
    insert_user(conn, cognito_sub="dup")
    expect(errors.UniqueViolation, conn,
           "INSERT INTO users (cognito_sub, email) VALUES ('dup', 'x@example.com')")


def test_one_founder_profile_per_user(conn):
    uid = insert_user(conn)
    insert_founder(conn, uid)
    expect(errors.UniqueViolation, conn, "INSERT INTO founder_profiles (user_id) VALUES (%s)", (uid,))


def test_founder_profile_requires_existing_user(conn):
    expect(errors.ForeignKeyViolation, conn,
           "INSERT INTO founder_profiles (user_id) VALUES (gen_random_uuid())")


def test_users_updated_at_changes_on_update(conn):
    uid = insert_user(conn)
    before = conn.execute("SELECT updated_at FROM users WHERE user_id=%s", (uid,)).fetchone()[0]
    conn.execute("UPDATE users SET name='New' WHERE user_id=%s", (uid,))
    after = conn.execute("SELECT updated_at FROM users WHERE user_id=%s", (uid,)).fetchone()[0]
    assert after > before


# ---- projects ----------------------------------------------------------------

@pytest.mark.parametrize("value", ["funding", "human_capital", "both"])
def test_valid_support_types(conn, value):
    insert_project(conn, insert_user(conn), support_type=value)


def test_invalid_support_type(conn):
    expect(errors.CheckViolation, conn,
           "INSERT INTO projects (project_name, description, support_type, needs) "
           "VALUES ('p','d','money','n')")


def test_invalid_project_status(conn):
    expect(errors.CheckViolation, conn,
           "INSERT INTO projects (project_name, description, support_type, needs, status) "
           "VALUES ('p','d','funding','n','weird')")


def test_project_default_status_is_draft(conn):
    pid = insert_project(conn)
    assert conn.execute("SELECT status FROM projects WHERE project_id=%s", (pid,)).fetchone()[0] == "draft"


def test_negative_funding_rejected(conn):
    expect(errors.CheckViolation, conn,
           "INSERT INTO projects (project_name, description, support_type, needs, funding_min) "
           "VALUES ('p','d','funding','n',-1)")
    expect(errors.CheckViolation, conn,
           "INSERT INTO projects (project_name, description, support_type, needs, funding_max) "
           "VALUES ('p','d','funding','n',-1)")


def test_funding_min_above_max_rejected(conn):
    expect(errors.CheckViolation, conn,
           "INSERT INTO projects (project_name, description, support_type, needs, funding_min, funding_max) "
           "VALUES ('p','d','funding','n',10,5)")


def test_funding_may_be_null_for_human_capital(conn):
    insert_project(conn, support_type="human_capital", funding_min=None, funding_max=None)


def test_project_creator_must_exist(conn):
    expect(errors.ForeignKeyViolation, conn,
           "INSERT INTO projects (created_by_user_id, project_name, description, support_type, needs) "
           "VALUES (gen_random_uuid(),'p','d','funding','n')")


def test_project_not_null_columns(conn):
    expect(errors.NotNullViolation, conn,
           "INSERT INTO projects (description, support_type, needs) VALUES ('d','funding','n')")


# ---- project_founders --------------------------------------------------------

def test_assign_multiple_founders_to_project(conn):
    pid = insert_project(conn)
    f1, f2 = insert_founder(conn), insert_founder(conn)
    conn.execute("INSERT INTO project_founders (project_id, founder_id, founder_role) VALUES (%s,%s,'primary')", (pid, f1))
    conn.execute("INSERT INTO project_founders (project_id, founder_id) VALUES (%s,%s)", (pid, f2))
    rows = conn.execute("SELECT founder_role FROM project_founders WHERE project_id=%s ORDER BY founder_role", (pid,)).fetchall()
    assert rows == [("cofounder",), ("primary",)]


def test_duplicate_founder_project_pair_rejected(conn):
    pid, fid = insert_project(conn), insert_founder(conn)
    conn.execute("INSERT INTO project_founders (project_id, founder_id) VALUES (%s,%s)", (pid, fid))
    expect(errors.UniqueViolation, conn,
           "INSERT INTO project_founders (project_id, founder_id) VALUES (%s,%s)", (pid, fid))


def test_duplicate_primary_founder_rejected(conn):
    pid = insert_project(conn)
    f1, f2 = insert_founder(conn), insert_founder(conn)
    conn.execute("INSERT INTO project_founders (project_id, founder_id, founder_role) VALUES (%s,%s,'primary')", (pid, f1))
    expect(errors.UniqueViolation, conn,
           "INSERT INTO project_founders (project_id, founder_id, founder_role) VALUES (%s,%s,'primary')", (pid, f2))


def test_primary_founder_allowed_on_different_projects(conn):
    f = insert_founder(conn)
    for _ in range(2):
        conn.execute("INSERT INTO project_founders (project_id, founder_id, founder_role) VALUES (%s,%s,'primary')",
                     (insert_project(conn), f))


def test_invalid_founder_role_rejected(conn):
    pid, fid = insert_project(conn), insert_founder(conn)
    expect(errors.CheckViolation, conn,
           "INSERT INTO project_founders (project_id, founder_id, founder_role) VALUES (%s,%s,'boss')", (pid, fid))


def test_project_founders_foreign_keys(conn):
    pid, fid = insert_project(conn), insert_founder(conn)
    expect(errors.ForeignKeyViolation, conn,
           "INSERT INTO project_founders (project_id, founder_id) VALUES (gen_random_uuid(), %s)", (fid,))
    expect(errors.ForeignKeyViolation, conn,
           "INSERT INTO project_founders (project_id, founder_id) VALUES (%s, gen_random_uuid())", (pid,))


def test_deleting_project_removes_founder_links(conn):
    pid, fid = insert_project(conn), insert_founder(conn)
    conn.execute("INSERT INTO project_founders (project_id, founder_id) VALUES (%s,%s)", (pid, fid))
    conn.execute("DELETE FROM projects WHERE project_id=%s", (pid,))
    assert conn.execute("SELECT count(*) FROM project_founders WHERE project_id=%s", (pid,)).fetchone()[0] == 0


def test_cannot_delete_founder_linked_to_project(conn):
    pid, fid = insert_project(conn), insert_founder(conn)
    conn.execute("INSERT INTO project_founders (project_id, founder_id) VALUES (%s,%s)", (pid, fid))
    expect(errors.RestrictViolation, conn, "DELETE FROM founder_profiles WHERE founder_id=%s", (fid,))
