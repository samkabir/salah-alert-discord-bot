# namaz-bot

A Discord bot that posts **daily prayer (waqt) alerts** — Fajr, Dhuhr, Asr,
Maghrib, and Isha — to a channel of your choice, per server. Times are fetched
once a day and cached, each waqt can be timed and styled independently, and you
can mute alerts for dates, date ranges, or specific time windows.

- Prayer times from the [Aladhan API](https://aladhan.com/prayer-times-api),
  with automatic fallbacks (a second Aladhan endpoint → offline astronomical
  computation → a bundled year-long table) so alerts keep working even if the API
  is down.
- Per-waqt on/off, timing offsets, custom messages, and active weekdays.
- Flexible muting: whole days, ranges, or `HH:MM–HH:MM` windows, each toggleable.
- Survives restarts — unfired alerts are rescheduled on boot, and each alert
  fires at most once per day.
- Nightly SQLite backups with 14-day retention.

---

## Setup

```bash
npm install
cp .env.example .env     # then fill in the values below
npm run deploy-commands  # register the /prayer command with Discord
npm run dev              # start the bot (hot-reload dev mode)
```

### Environment variables (`.env`)

| Variable        | Required | Default                     | Description                                              |
| --------------- | -------- | --------------------------- | -------------------------------------------------------- |
| `DISCORD_TOKEN` | yes      | —                           | Bot token from the Discord Developer Portal.             |
| `CLIENT_ID`     | yes      | —                           | Application (client) ID.                                 |
| `GUILD_ID`      | no       | —                           | If set, `/prayer` registers instantly to this one server; if empty, it registers globally (can take up to ~1 hour to appear). |
| `DB_PATH`       | no       | `./data/namaz-bot.sqlite`   | SQLite database file.                                    |
| `BACKUP_DIR`    | no       | `./data/backups`            | Where nightly backups are written.                       |
| `LAT`           | no       | `23.8103`                   | Latitude for prayer-time calculation.                    |
| `LON`           | no       | `90.4125`                   | Longitude.                                               |
| `TIMEZONE`      | no       | `Asia/Dhaka`                | IANA timezone; all times shown/scheduled use this.       |

> Changed `LAT`/`LON`? Regenerate the offline fallback table:
> `npx tsx scripts/generate-fallback.ts`.

### Running in production

```bash
npm run build   # compiles to dist/
npm start       # node dist/index.js
# or with pm2:
pm2 start ecosystem.config.js
```

> **Note:** `npm run build` (plain `tsc`) does not copy `src/db/migrations/*.sql`
> or `src/data/fallback-times.json` into `dist/`. For a `dist`-based deploy, copy
> those folders into `dist/` after building, or run in production with `tsx`.

---

## Quick start (typical first-time config)

```text
/prayer channel channel:#prayer-times
/prayer set waqt:fajr mode:start
/prayer set waqt:dhuhr mode:after value:5
/prayer days waqt:all days:mon,tue,wed,thu,fri,sat,sun
/prayer status
```

That posts each prayer's alert to `#prayer-times`: Fajr at its start time, Dhuhr
5 minutes after its start, every day of the week. `/prayer status` shows exactly
when today's alerts will fire.

---

## Command reference

All commands live under `/prayer` and are **admin-only** (they require the
Manage-Server / Administrator permission and don't work in DMs). Every reply is
ephemeral (only you see it). `waqt` is always one of `fajr`, `dhuhr`, `asr`,
`maghrib`, `isha`.

### `/prayer channel`

Set the channel where alerts are posted. **Required before any alert can fire.**

```text
/prayer channel channel:#prayer-times
```

### `/prayer toggle` — enable/disable a single waqt

```text
/prayer toggle waqt:isha enabled:false     # stop Isha alerts
/prayer toggle waqt:isha enabled:true      # resume Isha alerts
```

### `/prayer set` — configure a waqt's alert timing

```text
/prayer set waqt:<waqt> mode:<start|before|after|fixed> [value:<...>]
```

| Mode     | `value`               | Fires…                                             | Example                                        |
| -------- | --------------------- | -------------------------------------------------- | ---------------------------------------------- |
| `start`  | (omit)                | at the prayer's start time                         | `/prayer set waqt:fajr mode:start`             |
| `before` | minutes (integer > 0) | N minutes **before** the start time                | `/prayer set waqt:maghrib mode:before value:10`|
| `after`  | minutes (integer > 0) | N minutes **after** the start time                 | `/prayer set waqt:dhuhr mode:after value:5`    |
| `fixed`  | `HH:MM` (24-hour)     | at a fixed clock time, ignoring the prayer's time  | `/prayer set waqt:isha mode:fixed value:20:30` |

Examples covering every variation:

```text
/prayer set waqt:fajr mode:start                    # Fajr, exactly at start
/prayer set waqt:dhuhr mode:after value:5           # Dhuhr, 5 min after start
/prayer set waqt:asr mode:before value:15           # Asr, 15 min before start
/prayer set waqt:maghrib mode:after value:2         # Maghrib, 2 min after start
/prayer set waqt:isha mode:fixed value:20:30        # Isha, always 8:30 PM
```

Validation: `before`/`after` require a positive whole number of minutes; `fixed`
requires 24-hour `HH:MM` (e.g. `07:05`, `19:30`).

### `/prayer message` — customise a waqt's alert text

Use `{waqt}` and `{time}` as placeholders. Use `reset` to restore the default.

```text
/prayer message waqt:fajr text:🌅 {waqt} is at {time} — time to pray!
/prayer message waqt:maghrib text:It's {time}. {waqt} mubarak.
/prayer message waqt:fajr text:reset            # back to the default template
```

Default template: `🕌 It's time for **{waqt}** ({time}).`

### `/prayer days` — set which weekdays a waqt is active

Comma-separated from `mon,tue,wed,thu,fri,sat,sun`. Use `all` to apply to every
waqt at once.

```text
/prayer days waqt:all days:mon,tue,wed,thu,fri,sat,sun   # every day (the default)
/prayer days waqt:fajr days:mon,tue,wed,thu,fri           # Fajr on weekdays only
/prayer days waqt:dhuhr days:fri                          # Dhuhr only on Fridays
```

> To silence a prayer on every day, prefer `/prayer toggle`.

### Muting

Muting is built from **entries**. Each entry covers a single day or a date range,
optionally only a **time window**, and can be turned on/off without deleting it.
You can have as many entries as you like.

#### `/prayer mute day` — mute one day

```text
/prayer mute day date:2026-08-10                     # mute the whole day
/prayer mute day date:2026-08-10 time:12:00-18:00    # mute only 12:00–18:00 that day
```

With a `time` window, only prayers whose alert falls inside the window are muted
(e.g. `12:00-18:00` silences Dhuhr and Asr but leaves Fajr, Maghrib, Isha).

#### `/prayer mute range` — mute a date range

```text
/prayer mute range start:2026-08-10 end:2026-08-20                    # 11 days, all prayers
/prayer mute range start:2026-08-10 end:2026-08-12 time:04:00-06:00   # only early-morning alerts, those 3 days
```

Dates are `YYYY-MM-DD`; `start` must not be after `end`. A single-day range is
just `start` = `end` (or use `mute day`).

#### `/prayer mute list` — see all entries and their IDs

```text
/prayer mute list
```

Example output:

```text
Mute entries
`#3` [ON]  2026-08-10 (all day)
`#4` [ON]  2026-08-15 → 2026-08-20 (all day)
`#5` [OFF] 2026-08-22 (12:00–18:00)
```

#### `/prayer mute disable` / `enable` — turn an entry off/on (kept for reuse)

```text
/prayer mute disable id:3     # entry #3 stays in the list but stops muting
/prayer mute enable id:3      # reactivate it
```

#### `/prayer mute remove` — delete an entry

```text
/prayer mute remove id:5
```

#### `/prayer mute today` and `/prayer unmute`

```text
/prayer mute today   # silence all remaining alerts for the rest of today (auto-clears at midnight)
/prayer unmute       # resume immediately: clears "mute today" and deletes ranges covering today
```

### `/prayer status` — see everything at a glance

```text
/prayer status
```

Shows the alert channel, whether today is muted, **today's fetched times and
their source**, all mute entries, and for each waqt (in order Fajr → Isha) its
mode, active days, message type, and **exactly when today's alert will fire** —
e.g. `scheduled for 15:29`, `fired ✓ (12:10)`, `muted — time window (would be
13:00)`, or `off today — weekday`.

### `/prayer help`

```text
/prayer help
```

Lists every command.

---

## Worked examples

**"Alert 10 minutes before Maghrib, only on weekends."**

```text
/prayer set waqt:maghrib mode:before value:10
/prayer days waqt:maghrib days:sat,sun
```

**"Announce Isha at a fixed 8:30 PM with a custom message."**

```text
/prayer set waqt:isha mode:fixed value:20:30
/prayer message waqt:isha text:🌙 {waqt} jama'ah at {time}. Please join us.
```

**"We're travelling Aug 10–20 — pause everything, then come back."**

```text
/prayer mute range start:2026-08-10 end:2026-08-20
# ...later, if plans change for one of those days:
/prayer mute list
/prayer mute disable id:4
```

**"During exams, mute only the midday prayers (Dhuhr/Asr) for a week."**

```text
/prayer mute range start:2026-09-01 end:2026-09-07 time:12:00-18:00
```

---

## How timing works

Each day at **00:01** (in your `TIMEZONE`) the bot fetches that day's prayer
times, caches them, and schedules one alert per eligible waqt. An alert is
**eligible** when: the waqt is enabled, today is one of its active weekdays,
today isn't muted, and its computed time isn't in a mute window or already past.

The alert **time** comes from the waqt's mode (`start` / `before` / `after` /
`fixed`, see `/prayer set`). Each alert fires **at most once per day** — this is
tracked, so restarting the bot mid-day reschedules only the alerts that haven't
fired yet.

## Reliability: the fallback chain

When fetching times, the bot tries these in order and remembers which succeeded
(shown as the `source` in `/prayer status`):

1. **`aladhan`** — Aladhan API (primary).
2. **`aladhan-date`** — a second Aladhan endpoint (secondary).
3. **`offline-calc`** — computed on-device with the `adhan` library, no network
   needed (matches the API to within about a minute).
4. **`static-fallback`** — a bundled table of times for the whole year.

If a non-primary source is used, a notice is logged (and posted to the admin log
channel if one is configured in the database).

## Backups

Every night at **00:05** (`TIMEZONE`) the SQLite database is copied to
`BACKUP_DIR` as `namaz-bot-YYYY-MM-DD.sqlite`, and backups older than **14 days**
are pruned automatically.

---

## Troubleshooting

- **No alerts are posting.** Set a channel (`/prayer channel`), make sure the
  waqt is enabled (`/prayer toggle`), today is an active weekday (`/prayer
  days`), and nothing is muting it — `/prayer status` shows the reason per waqt.
- **Commands don't show up / show the old options.** Run `npm run
  deploy-commands` again. With `GUILD_ID` set they appear instantly; global
  registration can take up to ~1 hour.
- **Wrong times.** Check `LAT`/`LON` and `TIMEZONE` in `.env`. After changing
  coordinates, regenerate the offline table:
  `npx tsx scripts/generate-fallback.ts`.
- **"Today's times: Not cached yet" in status.** The daily fetch runs at 00:01,
  or on startup — restart the bot to fetch immediately.

## Project layout

See [`CLAUDE.md`](./CLAUDE.md) for the architecture, conventions, and
implementation details.
