CREATE TABLE users (
    user_id     uuid        NOT NULL DEFAULT gen_random_uuid(),
    cognito_sub text        NOT NULL,
    name        text,
    email       text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_pkey PRIMARY KEY (user_id),
    CONSTRAINT uq_users_cognito_sub UNIQUE (cognito_sub)
);

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
