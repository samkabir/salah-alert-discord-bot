CREATE TABLE IF NOT EXISTS guilds (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT,
  admin_log_channel_id TEXT,
  mute_today INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS waqt_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  waqt TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  offset_type TEXT NOT NULL DEFAULT 'start',
  offset_value INTEGER NOT NULL DEFAULT 0,
  custom_message TEXT,
  UNIQUE (guild_id, waqt)
);

CREATE TABLE IF NOT EXISTS active_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  waqt TEXT NOT NULL,
  weekday TEXT NOT NULL,
  UNIQUE (guild_id, waqt, weekday)
);

CREATE TABLE IF NOT EXISTS mute_ranges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prayer_times_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  fajr TEXT NOT NULL,
  dhuhr TEXT NOT NULL,
  asr TEXT NOT NULL,
  maghrib TEXT NOT NULL,
  isha TEXT NOT NULL,
  source TEXT NOT NULL,
  UNIQUE (guild_id, date)
);

CREATE TABLE IF NOT EXISTS fire_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  waqt TEXT NOT NULL,
  fire_date TEXT NOT NULL,
  fired_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (guild_id, waqt, fire_date)
);

CREATE INDEX IF NOT EXISTS idx_mute_ranges_guild ON mute_ranges(guild_id);
CREATE INDEX IF NOT EXISTS idx_active_days_guild_waqt ON active_days(guild_id, waqt);
