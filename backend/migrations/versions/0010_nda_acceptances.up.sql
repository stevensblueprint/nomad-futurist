CREATE TABLE nda_acceptances (
    nda_acceptance_id uuid        NOT NULL DEFAULT gen_random_uuid(),
    user_id           uuid        NOT NULL,
    nda_version       text        NOT NULL,
    accepted_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT nda_acceptances_pkey PRIMARY KEY (nda_acceptance_id),
    CONSTRAINT uq_nda_user_version UNIQUE (user_id, nda_version),
    CONSTRAINT fk_nda_user FOREIGN KEY (user_id)
        REFERENCES users (user_id) ON DELETE RESTRICT
);
