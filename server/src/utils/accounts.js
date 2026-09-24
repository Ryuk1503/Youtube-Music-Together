async function initAccounts(db) {
  await db.query(`
    CREATE SEQUENCE IF NOT EXISTS account_public_id_seq;
    CREATE TABLE IF NOT EXISTS accounts (
      id UUID PRIMARY KEY, username TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE,
      public_id TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS account_profiles (
      id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', avatar_url TEXT NOT NULL DEFAULT '',
      cover_url TEXT NOT NULL DEFAULT '', notes BIGINT NOT NULL DEFAULT 0 CHECK(notes>=0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS account_sessions (
      token_hash TEXT PRIMARY KEY, account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL
    );
    ALTER TABLE account_profiles ADD COLUMN IF NOT EXISTS fixed_notes BIGINT
      CHECK (fixed_notes >= 0);
    CREATE OR REPLACE FUNCTION preserve_fixed_notes() RETURNS trigger AS $$
    BEGIN
      IF NEW.fixed_notes IS NOT NULL THEN
        NEW.notes := NEW.fixed_notes;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE OR REPLACE TRIGGER account_profiles_fixed_notes
      BEFORE INSERT OR UPDATE ON account_profiles
      FOR EACH ROW EXECUTE FUNCTION preserve_fixed_notes();
    CREATE INDEX IF NOT EXISTS account_sessions_account_idx ON account_sessions(account_id);
    CREATE TABLE IF NOT EXISTS account_auth_limits (
      key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_events (
      id BIGSERIAL PRIMARY KEY, account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
      event TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS account_note_progress (
      account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      remainder_ms BIGINT NOT NULL DEFAULT 0 CHECK (remainder_ms >= 0 AND remainder_ms < 600000)
    );
    CREATE TABLE IF NOT EXISTS account_note_rewards (
      batch_id UUID NOT NULL,
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      elapsed_ms BIGINT NOT NULL CHECK (elapsed_ms > 0),
      awarded_notes BIGINT NOT NULL CHECK (awarded_notes >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY(batch_id, account_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS accounts_public_id_lower_idx ON accounts(lower(public_id));
    CREATE TABLE IF NOT EXISTS account_inventory (
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
      PRIMARY KEY(account_id, item_id)
    );
    CREATE TABLE IF NOT EXISTS account_shop_actions (
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      request_id UUID NOT NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      result JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY(account_id, request_id)
    );
    CREATE TABLE IF NOT EXISTS system_announcements (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      sender TEXT NOT NULL DEFAULT 'Ban Quản Trị',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}
module.exports = { initAccounts };
