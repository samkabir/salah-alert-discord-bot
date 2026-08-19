# CLAUDE.md

Guidance for AI agents (and humans) working in this repo.

## What this is

`namaz-bot` — a Discord bot (discord.js v14, TypeScript, strict mode) that posts
daily Islamic prayer (waqt) alerts to a configured channel, per guild. Prayer
times are fetched daily, cached in SQLite, and each of the five waqts is
scheduled as a one-off job with configurable timing offsets and mute rules.

## Commands

```bash
npm install
npm run dev              # tsx watch src/index.ts (hot reload; reads assets from src/)
npm run build            # tsc -> dist/  (NOTE: does not copy .sql/.json — see Deployment)
npm start                # node dist/index.js (production)
npm run deploy-commands  # register the /prayer slash command with Discord
npx tsc --noEmit         # typecheck; MUST stay clean
npx tsx scripts/generate-fallback.ts   # regenerate src/data/fallback-times.json
```

There is no test runner or linter configured. "Verified" means `npx tsc --noEmit`
is clean and, for behavior, a throwaway `tsx` script under `scripts/` was run
(delete it after).

## Environment (`.env`, see `.env.example`)

`DISCORD_TOKEN`, `CLIENT_ID` are required. `GUILD_ID` (optional) scopes command
registration to one guild (instant) vs global (slow to propagate). `DB_PATH`,
`BACKUP_DIR`, `LAT`, `LON`, `TIMEZONE` have defaults in `src/config/env.ts`
(Dhaka, Bangladesh by default). Importing `config/env` throws if a required var
is missing — standalone scripts that don't need Discord should read
`process.env` directly (see `scripts/generate-fallback.ts`).

## Architecture

```
src/
  index.ts                 composition root: client, event registration, ready -> initScheduler + initBackupSchedule
  config/env.ts            env parsing (throws on missing required vars)
  db/
    client.ts              opens SQLite (WAL), runs migrations, tracks applied ones in _migrations
    migrations/*.sql        numbered, applied once each in filename order
    repositories/*.repo.ts  ALL SQL lives here — one file per table/concern
  services/
    prayerTimes.service.ts  fetch with fallback chain (see below)
    scheduler.service.ts    daily fetch cron, per-waqt alert jobs, startup recovery
    backup.service.ts       daily SQLite copy + retention prune
    eligibility.service.ts  is a waqt allowed to fire today / at a given time
    logger.service.ts       console + optional admin-log-channel error/fallback notices
  commands/
    index.ts               builds the /prayer command tree and routes interactions
    prayer/*.ts            one subcommand per file; mute is a subcommand GROUP
    types.ts               PrayerSubcommand interface
  events/                  ready.ts, interactionCreate.ts
  utils/
    time.ts                timezone-aware helpers (see below)
    permissions.ts         admin-only gate for /prayer
  types/prayer.types.ts    shared domain types + WAQTS/OFFSET_TYPES/WEEKDAYS consts
  data/fallback-times.json bundled full-year static prayer times (generated)
scripts/generate-fallback.ts  one-off generator for the static JSON
```

## Hard conventions

- **All DB access goes through `src/db/repositories/*.repo.ts`.** Never write SQL
  in services/commands. Add a repo function if you need new access.
- **Schema changes = a new numbered migration** (`NNN_description.sql`). The runner
  in `client.ts` records applied files in `_migrations` and runs each once, so
  non-idempotent `ALTER TABLE` is safe. `001_init.sql` uses `CREATE TABLE IF NOT
  EXISTS` and stays re-runnable for pre-tracking databases.
- **Never construct wall-clock times by hand.** Use `utils/time.ts`:
  `todayIso()` (YYYY-MM-DD in TIMEZONE), `currentWeekday()`, `zonedTimeToDate(iso,
  h, m)` (wall time in TIMEZONE → absolute Date), `formatTimeInZone(date)`
  (absolute Date → "HH:MM" in TIMEZONE). These use `Intl`, so they are correct
  regardless of the server's OS timezone.
- **Canonical waqt order** is `WAQTS` in `types/prayer.types.ts` (Fajr, Dhuhr,
  Asr, Maghrib, Isha) — never alphabetical. `getAllWaqtSettings` sorts by it.
- **Any command that mutates alert config must call `rescheduleGuildAlerts`**
  (`scheduler.service.ts`) after its DB write. Alerts are armed as node-schedule
  one-off jobs whose fire time is baked in when armed, so a DB write alone leaves
  the stale job running and firing at the old time. This applies to `set`,
  `toggle`, `days`, `message`, `unmute`, and every `mute` subcommand. `channel` is
  exempt: the job resolves the channel from `getGuildConfig` at fire time.
- **Re-run `npm run deploy-commands`** whenever the command schema changes (new
  subcommand/option), or Discord keeps showing the old shape.

## Prayer-times fallback chain (`prayerTimes.service.ts`)

`fetchPrayerTimes(client, guildId, date)` tries, in order, returning the winning
`source`:

1. `aladhan` — Aladhan `/v1/timings/{unix}` (primary).
2. `aladhan-date` — Aladhan `/v1/timings/DD-MM-YYYY` (secondary, distinct path).
3. `offline-calc` — offline astronomical computation via the `adhan` package
   (`CalculationMethod.Karachi()` + `Madhab.Shafi`, chosen to match Aladhan
   `method=1`/default school; verified within ~1 min of the API). No network/key.
4. `static-fallback` — `src/data/fallback-times.json`, a full-year table keyed
   `MM-DD`, generated from authoritative Aladhan calendar data.

Any non-primary success calls `logFallbackUsage()`. There is **no** second
independent no-key HTTP provider in the wild — that's why the offline calc is the
real cross-domain backup. Regenerate the static file with the generator script if
`LAT`/`LON` change.

## Scheduler (`scheduler.service.ts`)

- `scheduleDailyFetchJob` — node-schedule cron `{ rule: "1 0 * * *", tz: TIMEZONE }`:
  resets per-day mute for all guilds, then per guild fetches+caches times and calls
  `scheduleTodayAlerts`.
- `scheduleTodayAlerts(client, guildId)` — per waqt: `isEligibleToday` →
  `computeAlertDate` (from cached start time + offset) → skip if in the past,
  already fired (`fire_log`), or inside a mute time-window → schedule a **named**
  one-off job (`alert:<guild>:<waqt>:<iso>`) that posts the embed then
  `markFired`. Post is try/caught → `logError`. Duplicate job names + a fire-time
  `hasFired` re-check prevent double-posting.
- `onStartupRecovery(client)` — on boot, ensure today's times are cached (fetch if
  missing) and reschedule any unfired alerts, so a mid-day restart doesn't drop
  them. Wired alongside the cron in `initScheduler`.
- `rescheduleGuildAlerts(client, guildId)` — cancels every armed `alert:<guild>:*`
  job (node-schedule's `cancel()` also drops the name from `scheduledJobs`, so the
  duplicate-name guard won't block the re-arm) then re-runs `scheduleTodayAlerts`
  from current settings. This is what makes a config change take effect today
  instead of at the next 00:01 cron / restart.
- The fired job re-reads its `WaqtSetting` at fire time, so a mid-day `message`
  edit or `toggle` off is honoured even by a job armed before the change. The fire
  *time* still requires a re-arm.
- `computeAlertDate` is exported so `/prayer status` shows the exact same time the
  scheduler will use.

## Offset modes (`waqt_settings.offset_type` / `offset_value`)

- `start` — at the waqt's start time (value ignored).
- `before` / `after` — value minutes before/after start.
- `fixed` — at a fixed clock time; value is minutes since midnight (`HH*60+MM`),
  cached start time ignored.

## Mute model (`mute_ranges`)

Multiple entries per guild. Each has a date span (`start_date`..`end_date`; a
single day has them equal), an `enabled` flag, and an optional time window
(`from_time`/`to_time`, `HH:MM`). Semantics:

- windowless + enabled + covers today → **whole day muted** (day-level, in
  `isEligibleToday` via `isDateFullDayMuted`).
- windowed + enabled + covers today → mutes only waqts whose computed alert
  `HH:MM` falls in `[from,to]` (`isAlertTimeMuted`, checked in the scheduler).
- `mute_today` (per-guild boolean) is the separate "rest of today" mute, reset by
  the daily job. `unmute` clears it and deletes ranges covering today.

## Deployment

`npm run build` runs `tsc` then `scripts/copy-assets.mjs`, which copies the
non-TS runtime assets `tsc` doesn't emit (`src/db/migrations` and `src/data`) into
`dist/`. `pm2` (`ecosystem.config.js`) runs `dist/index.js` with `TZ=Asia/Dhaka`,
so after any source change: `npm run build && pm2 restart namaz-bot`.

`ecosystem.config.js` sets no `cwd`, and `DB_PATH`/`BACKUP_DIR` default to
`./data/...` while `dotenv` resolves `.env` relative to cwd — so pm2 must be
started from the project root or it will silently use a different database.
`pm2 restart` re-reads `.env` (read at boot) but **not** the `env:` block in
`ecosystem.config.js`; that needs `--update-env`.

## Gotchas

- `discord.js` channel sends require the channel to be a `TextChannel`; the code
  guards with `instanceof TextChannel`.
- `fire_log` has a UNIQUE(guild, waqt, date) — `markFired` is INSERT OR IGNORE, so
  it's safe to call more than once; the dedupe that matters is not double-*posting*.
- Timezone: all logic is TIMEZONE-relative via `utils/time.ts`; do not rely on
  `TZ` being set (it is in pm2, but code shouldn't assume it).
