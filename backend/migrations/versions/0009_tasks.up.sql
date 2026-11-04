CREATE TABLE tasks (
    task_id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    project_id       uuid        NOT NULL,
    created_by_id    uuid        NOT NULL,
    owner_id         uuid,
    assigned_by_id   uuid,
    title            text        NOT NULL,
    description      text,
    priority         text,
    status           text        NOT NULL DEFAULT 'todo',
    assigned_at      timestamptz,
    due_at           timestamptz,
    completed_at     timestamptz,
    reminder_enabled boolean     NOT NULL DEFAULT false,
    CONSTRAINT tasks_pkey PRIMARY KEY (task_id),
    CONSTRAINT fk_tasks_project FOREIGN KEY (project_id)
        REFERENCES projects (project_id) ON DELETE CASCADE,
    CONSTRAINT fk_tasks_created_by FOREIGN KEY (created_by_id)
        REFERENCES users (user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_tasks_owner FOREIGN KEY (owner_id)
        REFERENCES users (user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_tasks_assigned_by FOREIGN KEY (assigned_by_id)
        REFERENCES users (user_id) ON DELETE RESTRICT,
    CONSTRAINT ck_tasks_status CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
    CONSTRAINT ck_tasks_priority CHECK (priority IS NULL OR priority IN ('low', 'medium', 'high'))
);

CREATE INDEX idx_tasks_project_id ON tasks (project_id);
CREATE INDEX idx_tasks_owner_id ON tasks (owner_id);
CREATE INDEX idx_tasks_assigned_by_id ON tasks (assigned_by_id);
