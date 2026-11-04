CREATE TABLE project_documents (
    document_id       uuid        NOT NULL DEFAULT gen_random_uuid(),
    project_id        uuid        NOT NULL,
    uploaded_by       uuid        NOT NULL,
    document_type     text        NOT NULL,
    s3_key            text        NOT NULL,
    original_filename text,
    uploaded_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_documents_pkey PRIMARY KEY (document_id),
    CONSTRAINT fk_documents_project FOREIGN KEY (project_id)
        REFERENCES projects (project_id) ON DELETE CASCADE,
    CONSTRAINT fk_documents_uploaded_by FOREIGN KEY (uploaded_by)
        REFERENCES users (user_id) ON DELETE RESTRICT
);

CREATE INDEX idx_project_documents_project_id ON project_documents (project_id);
CREATE INDEX idx_project_documents_uploaded_by ON project_documents (uploaded_by);
