CREATE TABLE project_progress_state (
    state_id     uuid        NOT NULL DEFAULT gen_random_uuid(),
    project_id   uuid        NOT NULL,
    stage_id     varchar     NOT NULL,
    status       varchar     NOT NULL DEFAULT 'not_started',
    started_at   timestamptz,
    completed_at timestamptz,
    completed_by uuid,
    CONSTRAINT project_progress_state_pkey PRIMARY KEY (state_id),
    CONSTRAINT uq_progress_project_stage UNIQUE (project_id, stage_id),
    CONSTRAINT fk_progress_project FOREIGN KEY (project_id)
        REFERENCES projects (project_id) ON DELETE CASCADE,
    CONSTRAINT fk_progress_completed_by FOREIGN KEY (completed_by)
        REFERENCES users (user_id) ON DELETE RESTRICT,
    CONSTRAINT ck_progress_status CHECK (status IN ('not_started', 'in_progress', 'completed')),
    CONSTRAINT ck_progress_dates CHECK
        (started_at IS NULL OR completed_at IS NULL OR completed_at >= started_at)
);
