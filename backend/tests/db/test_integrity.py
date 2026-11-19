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


@pytest.mark.parametrize("value", ["draft", "pending", "under_review", "approved", "declined", "archived"])
def test_valid_project_status(conn, value):
    conn.execute(
        "INSERT INTO projects (project_name, description, support_type, needs, status) "
        "VALUES ('p','d','funding','n',%s)", (value,))


@pytest.mark.parametrize("value", ["submitted", "needs_revision", "rejected"])
def test_removed_project_status_rejected(conn, value):
    expect(errors.CheckViolation, conn,
           "INSERT INTO projects (project_name, description, support_type, needs, status) "
           "VALUES ('p','d','funding','n',%s)", (value,))


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


# ---- project_progress_state --------------------------------------------------

def test_progress_state_roundtrip_and_unique_stage(conn):
    pid, uid = insert_project(conn), insert_user(conn)
    conn.execute("INSERT INTO project_progress_state (project_id, stage_id) VALUES (%s,'intake')", (pid,))
    conn.execute("UPDATE project_progress_state SET status='completed', started_at=now(), completed_at=now() + interval '1 hour', completed_by=%s WHERE project_id=%s", (uid, pid))
    expect(errors.UniqueViolation, conn,
           "INSERT INTO project_progress_state (project_id, stage_id) VALUES (%s,'intake')", (pid,))


def test_progress_state_invalid_status_and_dates(conn):
    pid = insert_project(conn)
    expect(errors.CheckViolation, conn,
           "INSERT INTO project_progress_state (project_id, stage_id, status) VALUES (%s,'a','bad')", (pid,))
    expect(errors.CheckViolation, conn,
           "INSERT INTO project_progress_state (project_id, stage_id, started_at, completed_at) "
           "VALUES (%s,'b', now(), now() - interval '1 day')", (pid,))


def test_progress_state_foreign_keys(conn):
    expect(errors.ForeignKeyViolation, conn,
           "INSERT INTO project_progress_state (project_id, stage_id) VALUES (gen_random_uuid(),'x')")
    pid = insert_project(conn)
    expect(errors.ForeignKeyViolation, conn,
           "INSERT INTO project_progress_state (project_id, stage_id, completed_by) VALUES (%s,'x',gen_random_uuid())", (pid,))


# ---- project_documents -------------------------------------------------------

def test_project_document_insert_and_foreign_keys(conn):
    pid, uid = insert_project(conn), insert_user(conn)
    conn.execute("INSERT INTO project_documents (project_id, uploaded_by, document_type, s3_key) VALUES (%s,%s,'pitch_deck','k/1')", (pid, uid))
    expect(errors.ForeignKeyViolation, conn,
           "INSERT INTO project_documents (project_id, uploaded_by, document_type, s3_key) VALUES (gen_random_uuid(),%s,'t','k')", (uid,))
    expect(errors.ForeignKeyViolation, conn,
           "INSERT INTO project_documents (project_id, uploaded_by, document_type, s3_key) VALUES (%s,gen_random_uuid(),'t','k')", (pid,))
    expect(errors.NotNullViolation, conn,
           "INSERT INTO project_documents (project_id, uploaded_by, document_type) VALUES (%s,%s,'t')", (pid, uid))


# ---- validation --------------------------------------------------------------

def insert_validation(conn, pid, reviewer, **kw):
    kw.setdefault("verdict", "needs_revision")
    kw.setdefault("score", 5)
    return conn.execute(
        "INSERT INTO validation (project_id, reviewer_id, verdict, feedback, probing_questions, next_steps, score) "
        "VALUES (%s,%s,%s,'f','q','n',%s) RETURNING validation_id",
        (pid, reviewer, kw["verdict"], kw["score"])).fetchone()[0]


def test_create_and_update_validation(conn):
    pid, reviewer = insert_project(conn), insert_user(conn)
    vid = insert_validation(conn, pid, reviewer)
    before = conn.execute("SELECT created_at, updated_at FROM validation WHERE validation_id=%s", (vid,)).fetchone()
    conn.execute("UPDATE validation SET verdict='approved', score=9, updated_by=%s WHERE validation_id=%s", (reviewer, vid))
    row = conn.execute("SELECT verdict, score, updated_by, created_at, updated_at FROM validation WHERE validation_id=%s", (vid,)).fetchone()
    assert row[:3] == ("approved", 9, reviewer)
    assert row[3] == before[0] and row[4] > before[1]


def test_only_one_validation_per_project(conn):
    pid, reviewer = insert_project(conn), insert_user(conn)
    insert_validation(conn, pid, reviewer)
    expect(errors.UniqueViolation, conn,
           "INSERT INTO validation (project_id, reviewer_id, verdict, feedback, probing_questions, next_steps) "
           "VALUES (%s,%s,'approved','f','q','n')", (pid, reviewer))


@pytest.mark.parametrize("score", [0, 11, -1])
def test_validation_score_out_of_range(conn, score):
    pid, reviewer = insert_project(conn), insert_user(conn)
    expect(errors.CheckViolation, conn,
           "INSERT INTO validation (project_id, reviewer_id, verdict, feedback, probing_questions, next_steps, score) "
           "VALUES (%s,%s,'approved','f','q','n',%s)", (pid, reviewer, score))


@pytest.mark.parametrize("score", [1, 10, None])
def test_validation_score_valid_values(conn, score):
    insert_validation(conn, insert_project(conn), insert_user(conn), score=score)


def test_validation_invalid_verdict_and_foreign_keys(conn):
    pid, reviewer = insert_project(conn), insert_user(conn)
    expect(errors.CheckViolation, conn,
           "INSERT INTO validation (project_id, reviewer_id, verdict, feedback, probing_questions, next_steps) "
           "VALUES (%s,%s,'maybe','f','q','n')", (pid, reviewer))
    expect(errors.ForeignKeyViolation, conn,
           "INSERT INTO validation (project_id, reviewer_id, verdict, feedback, probing_questions, next_steps) "
           "VALUES (%s,gen_random_uuid(),'approved','f','q','n')", (pid,))
    expect(errors.ForeignKeyViolation, conn,
           "INSERT INTO validation (project_id, reviewer_id, updated_by, verdict, feedback, probing_questions, next_steps) "
           "VALUES (%s,%s,gen_random_uuid(),'approved','f','q','n')", (pid, reviewer))


@pytest.mark.parametrize("value", ["approved", "needs_revision", "declined"])
def test_valid_verdict(conn, value):
    insert_validation(conn, insert_project(conn), insert_user(conn), verdict=value)


def test_removed_verdict_rejected(conn):
    pid, reviewer = insert_project(conn), insert_user(conn)
    expect(errors.CheckViolation, conn,
           "INSERT INTO validation (project_id, reviewer_id, verdict, feedback, probing_questions, next_steps) "
           "VALUES (%s,%s,'rejected','f','q','n')", (pid, reviewer))


def test_delete_validation(conn):
    pid, reviewer = insert_project(conn), insert_user(conn)
    vid = insert_validation(conn, pid, reviewer)
    conn.execute("DELETE FROM validation WHERE validation_id=%s", (vid,))
    insert_validation(conn, pid, reviewer)  # allowed again after delete


# ---- tasks -------------------------------------------------------------------

def test_create_project_task_with_valid_users(conn):
    pid, creator, owner = insert_project(conn), insert_user(conn), insert_user(conn)
    tid = conn.execute(
        "INSERT INTO tasks (project_id, created_by_id, owner_id, assigned_by_id, title, priority, assigned_at) "
        "VALUES (%s,%s,%s,%s,'Write plan','critical', now()) RETURNING task_id", (pid, creator, owner, creator)).fetchone()[0]
    row = conn.execute("SELECT status, reminder_enabled FROM tasks WHERE task_id=%s", (tid,)).fetchone()
    assert row == ("request_submitted", False)
    conn.execute("UPDATE tasks SET status='completed', completed_at=now() WHERE task_id=%s", (tid,))


def test_task_owner_may_be_null(conn):
    conn.execute("INSERT INTO tasks (project_id, created_by_id, title) VALUES (%s,%s,'t')",
                 (insert_project(conn), insert_user(conn)))


def test_task_foreign_keys(conn):
    pid, uid = insert_project(conn), insert_user(conn)
    # Bad created_by_id.
    expect(errors.ForeignKeyViolation, conn,
           "INSERT INTO tasks (project_id, created_by_id, title) VALUES (%s, gen_random_uuid(), 't')", (pid,))
    # Bad owner_id.
    expect(errors.ForeignKeyViolation, conn,
           "INSERT INTO tasks (project_id, created_by_id, owner_id, title) VALUES (%s, %s, gen_random_uuid(), 't')", (pid, uid))
    # Bad assigned_by_id.
    expect(errors.ForeignKeyViolation, conn,
           "INSERT INTO tasks (project_id, created_by_id, assigned_by_id, title) VALUES (%s, %s, gen_random_uuid(), 't')", (pid, uid))
    # Bad project_id.
    expect(errors.ForeignKeyViolation, conn,
           "INSERT INTO tasks (project_id, created_by_id, title) VALUES (gen_random_uuid(), %s, 't')", (uid,))


def test_task_invalid_status_and_priority(conn):
    pid, uid = insert_project(conn), insert_user(conn)
    expect(errors.CheckViolation, conn,
           "INSERT INTO tasks (project_id, created_by_id, title, status) VALUES (%s,%s,'t','todo')", (pid, uid))
    expect(errors.CheckViolation, conn,
           "INSERT INTO tasks (project_id, created_by_id, title, priority) VALUES (%s,%s,'t','urgent')", (pid, uid))


@pytest.mark.parametrize("value", ["request_submitted", "under_review", "unassigned", "assigned",
                                   "in_progress", "blocked", "completed", "cancelled"])
def test_valid_task_status(conn, value):
    pid, uid = insert_project(conn), insert_user(conn)
    conn.execute(
        "INSERT INTO tasks (project_id, created_by_id, title, status) VALUES (%s,%s,'t',%s)", (pid, uid, value))


@pytest.mark.parametrize("value", ["todo", "done"])
def test_removed_task_status_rejected(conn, value):
    pid, uid = insert_project(conn), insert_user(conn)
    expect(errors.CheckViolation, conn,
           "INSERT INTO tasks (project_id, created_by_id, title, status) VALUES (%s,%s,'t',%s)", (pid, uid, value))


@pytest.mark.parametrize("value", ["critical", "standard"])
def test_valid_task_priority(conn, value):
    conn.execute(
        "INSERT INTO tasks (project_id, created_by_id, title, priority) VALUES (%s,%s,'t',%s)",
        (insert_project(conn), insert_user(conn), value))


@pytest.mark.parametrize("value", ["low", "medium", "high"])
def test_removed_task_priority_rejected(conn, value):
    pid, uid = insert_project(conn), insert_user(conn)
    expect(errors.CheckViolation, conn,
           "INSERT INTO tasks (project_id, created_by_id, title, priority) VALUES (%s,%s,'t',%s)", (pid, uid, value))


def test_task_requires_title(conn):
    expect(errors.NotNullViolation, conn,
           "INSERT INTO tasks (project_id, created_by_id) VALUES (%s,%s)", (insert_project(conn), insert_user(conn)))


# ---- nda_acceptances ---------------------------------------------------------

def test_nda_acceptance_unique_per_user_and_version(conn):
    uid = insert_user(conn)
    conn.execute("INSERT INTO nda_acceptances (user_id, nda_version) VALUES (%s,'v1')", (uid,))
    conn.execute("INSERT INTO nda_acceptances (user_id, nda_version) VALUES (%s,'v2')", (uid,))
    expect(errors.UniqueViolation, conn,
           "INSERT INTO nda_acceptances (user_id, nda_version) VALUES (%s,'v1')", (uid,))
    expect(errors.ForeignKeyViolation, conn,
           "INSERT INTO nda_acceptances (user_id, nda_version) VALUES (gen_random_uuid(),'v1')")


# ---- structure ---------------------------------------------------------------

def test_exactly_nine_application_tables(conn):
    names = {r[0] for r in conn.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name <> 'schema_migrations'")}
    assert names == {"users", "founder_profiles", "projects", "project_founders", "project_progress_state",
                     "project_documents", "validation", "tasks", "nda_acceptances"}


def test_full_down_then_up_round_trip(fresh_db_url):
    import migrate
    ms = migrate.load_migrations(migrate.VERSIONS_DIR)
    with psycopg.connect(fresh_db_url, autocommit=True) as c:
        migrate.migrate_up(c, ms)
        assert migrate.migrate_down(c, ms, steps=len(ms)) == [m.version for m in reversed(ms)]
        left = {r[0] for r in c.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")}
        assert left == {"schema_migrations"}
        migrate.migrate_up(c, ms)
        assert migrate.check(c, ms) == []
