CREATE TABLE validation (
    validation_id     uuid        NOT NULL DEFAULT gen_random_uuid(),
    project_id        uuid        NOT NULL,
    reviewer_id       uuid        NOT NULL,
    updated_by        uuid,
    verdict           text        NOT NULL,
    feedback          text        NOT NULL,
    probing_questions text        NOT NULL,
    next_steps        text        NOT NULL,
    score             smallint,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT validation_pkey PRIMARY KEY (validation_id),
    CONSTRAINT uq_validation_project_id UNIQUE (project_id),
    CONSTRAINT fk_validation_project FOREIGN KEY (project_id)
        REFERENCES projects (project_id) ON DELETE CASCADE,
    CONSTRAINT fk_validation_reviewer FOREIGN KEY (reviewer_id)
        REFERENCES users (user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_validation_updated_by FOREIGN KEY (updated_by)
        REFERENCES users (user_id) ON DELETE RESTRICT,
    CONSTRAINT ck_validation_verdict CHECK (verdict IN ('approved', 'rejected', 'needs_revision')),
    CONSTRAINT ck_validation_score CHECK (score IS NULL OR score BETWEEN 1 AND 10)
);

CREATE INDEX idx_validation_reviewer_id ON validation (reviewer_id);

CREATE INDEX idx_validation_updated_by ON validation (updated_by);

CREATE TRIGGER trg_validation_updated_at BEFORE UPDATE ON validation
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
