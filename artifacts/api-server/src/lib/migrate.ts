import pg from "pg";
import { logger } from "./logger";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS bot_json_store (
  store_name TEXT PRIMARY KEY,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS server_backups (
  id         TEXT PRIMARY KEY,
  guild_id   TEXT NOT NULL,
  trigger    TEXT NOT NULL,
  taken_at   TIMESTAMPTZ NOT NULL,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cases (
  id           BIGSERIAL PRIMARY KEY,
  guild_id     TEXT NOT NULL,
  case_number  INTEGER NOT NULL,
  action       TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  reason       TEXT NOT NULL DEFAULT 'No reason provided',
  proof        TEXT,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (guild_id, case_number)
);

CREATE INDEX IF NOT EXISTS idx_cases_guild_target ON cases (guild_id, target_id);
CREATE INDEX IF NOT EXISTS idx_cases_guild_number ON cases (guild_id, case_number);

CREATE TABLE IF NOT EXISTS appeals (
  id              BIGSERIAL PRIMARY KEY,
  guild_id        TEXT NOT NULL,
  case_number     INTEGER NOT NULL,
  user_id         TEXT NOT NULL,
  punishment_type TEXT NOT NULL,
  why_happened    TEXT NOT NULL,
  defense         TEXT NOT NULL,
  proof           TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  reviewed_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appeals_guild_user ON appeals (guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_appeals_status    ON appeals (guild_id, status);

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id           TEXT NOT NULL,
  module_name        TEXT NOT NULL,
  enabled            BOOLEAN NOT NULL DEFAULT true,
  log_channel_id     TEXT,
  permitted_role_ids TEXT[] NOT NULL DEFAULT '{}',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, module_name)
);

CREATE TABLE IF NOT EXISTS quota_streaks (
  guild_id          TEXT NOT NULL,
  user_id           TEXT NOT NULL,
  consecutive_fails INTEGER NOT NULL DEFAULT 0,
  last_check_week   BIGINT  NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_quota_streaks_guild ON quota_streaks (guild_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ language 'plpgsql';

DROP TRIGGER IF EXISTS trg_bot_json_store_updated_at   ON bot_json_store;
CREATE TRIGGER trg_bot_json_store_updated_at
  BEFORE UPDATE ON bot_json_store
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS trg_cases_updated_at ON cases;
CREATE TRIGGER trg_cases_updated_at
  BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS trg_guild_settings_updated_at ON guild_settings;
CREATE TRIGGER trg_guild_settings_updated_at
  BEFORE UPDATE ON guild_settings
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS trg_quota_streaks_updated_at ON quota_streaks;
CREATE TRIGGER trg_quota_streaks_updated_at
  BEFORE UPDATE ON quota_streaks
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
`;

export async function runMigrations(): Promise<void> {
  const dbUrl = process.env["SUPABASE_DB_URL"];

  if (!dbUrl) {
    logger.warn(
      "SUPABASE_DB_URL is not set — skipping auto-migration. " +
      "Set it to your Supabase PostgreSQL connection string (Supabase → Settings → Database → URI) " +
      "so tables are created automatically on every deploy."
    );
    return;
  }

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  });

  try {
    await client.connect();
    logger.info("Running database migrations…");
    await client.query(SCHEMA_SQL);
    logger.info("Database migrations complete — all tables ready.");
  } catch (err) {
    logger.error({ err }, "Database migration failed. Bot will still start but Supabase storage may not work.");
  } finally {
    await client.end().catch(() => {});
  }
}