CREATE TABLE projects (
    project_id         uuid          NOT NULL DEFAULT gen_random_uuid(),
    created_by_user_id uuid,
    project_name       text          NOT NULL,
    description        text          NOT NULL,
    support_type       text          NOT NULL,
    needs              text          NOT NULL,
    funding_min        numeric(14,2),
    funding_max        numeric(14,2),
    status             text          NOT NULL DEFAULT 'draft',
    submitted_at       timestamptz,
    created_at         timestamptz   NOT NULL DEFAULT now(),
    updated_at         timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT projects_pkey PRIMARY KEY (project_id),
    CONSTRAINT fk_projects_created_by_user FOREIGN KEY (created_by_user_id)
        REFERENCES users (user_id) ON DELETE RESTRICT,
    CONSTRAINT ck_projects_support_type CHECK (support_type IN ('funding', 'human_capital', 'both')),
    CONSTRAINT ck_projects_status CHECK (status IN
        ('draft', 'submitted', 'under_review', 'needs_revision', 'approved', 'rejected')),
    CONSTRAINT ck_projects_funding_min_nonneg CHECK (funding_min IS NULL OR funding_min >= 0),
    CONSTRAINT ck_projects_funding_max_nonneg CHECK (funding_max IS NULL OR funding_max >= 0),
    CONSTRAINT ck_projects_funding_range CHECK
        (funding_min IS NULL OR funding_max IS NULL OR funding_min <= funding_max)
);

CREATE INDEX idx_projects_created_by_user_id ON projects (created_by_user_id);
CREATE INDEX idx_projects_status ON projects (status);

CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
