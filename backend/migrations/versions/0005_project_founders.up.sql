CREATE TABLE project_founders (
    project_id   uuid        NOT NULL,
    founder_id   uuid        NOT NULL,
    founder_role text        NOT NULL DEFAULT 'cofounder',
    joined_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_founders_pkey PRIMARY KEY (project_id, founder_id),
    CONSTRAINT fk_project_founders_project FOREIGN KEY (project_id)
        REFERENCES projects (project_id) ON DELETE CASCADE,
    CONSTRAINT fk_project_founders_founder FOREIGN KEY (founder_id)
        REFERENCES founder_profiles (founder_id) ON DELETE RESTRICT,
    CONSTRAINT ck_project_founders_role CHECK (founder_role IN ('primary', 'cofounder'))
);

CREATE INDEX idx_project_founders_founder_id ON project_founders (founder_id);
CREATE UNIQUE INDEX uq_project_founders_one_primary
    ON project_founders (project_id) WHERE founder_role = 'primary';
