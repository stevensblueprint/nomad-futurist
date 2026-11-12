CREATE TABLE founder_profiles (
    founder_id   uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL,
    address      text,
    phone        varchar(32),
    linkedin_url text,
    CONSTRAINT founder_profiles_pkey PRIMARY KEY (founder_id),
    CONSTRAINT uq_founder_profiles_user_id UNIQUE (user_id),
    CONSTRAINT fk_founder_profiles_user FOREIGN KEY (user_id)
        REFERENCES users (user_id) ON DELETE RESTRICT
);
