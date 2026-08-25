# Deployment

How to get changes onto the production server without losing your guild's alert
configuration. Read [One-time: stop tracking the database](#one-time-stop-tracking-the-database)
first — it only needs doing once, but nothing else here is safe until it is done.

Assumptions: the bot runs under `pm2` as `namaz-bot`, started **from the project
root** (`ecosystem.config.js` sets no `cwd`, and both `DB_PATH` and the `.env`
lookup are relative to the working directory — start it anywhere else and it
silently uses a different database).

---

## What is at risk, and what is not

Your configuration — alert channel, per-waqt timings, custom messages, active
weekdays, mute entries — lives in **one file**: `data/namaz-bot.sqlite` (or
wherever `DB_PATH` points). Nothing else on the server holds it.

Two things can destroy it. Neither is the application code:

1. **git overwriting or deleting that file during a pull**, because the file is
   currently tracked in the repository. This is the real risk and the whole
   reason for the one-time step below.
2. **Starting pm2 from the wrong directory**, which creates a fresh empty
   database instead of opening yours. The symptom is a bot that acts newly
   installed — no channel set, all waqts at defaults.

Migrations are *not* a risk. Every migration in this project is additive
(`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN ... DEFAULT ...`);
none contains `DROP`, `DELETE`, or an `UPDATE` of existing rows. The runner
records applied filenames in the `_migrations` table and runs each exactly once,
so restarting repeatedly is harmless.

---

## One-time: stop tracking the database

`data/namaz-bot.sqlite`, `-shm` and `-wal` are committed to git. That means the
repository holds a stale snapshot of a database at the same path as your live
one, and every `git pull` is a chance to overwrite the live one with the stale
one.

### On your development machine

```bash
printf 'data/\n' >> .gitignore
git rm --cached data/namaz-bot.sqlite data/namaz-bot.sqlite-shm data/namaz-bot.sqlite-wal
git commit -m "chore: stop tracking the runtime SQLite database"
git push
```

`git rm --cached` leaves your local file alone; it only removes it from git's
index.

### Then on the server — read this before pulling

The commit above tells git "these paths are no longer tracked". When the server
pulls it, git will try to **delete those files from the working tree**. Because
the running bot is constantly writing to the database, git will probably refuse
and abort the pull instead — but do not rely on that. Follow the checklist below,
which backs the database up first and restores it after the pull, at which point
`data/` is ignored and git can never touch it again.

---

## Deploy checklist

Pick a window that is not within ~10 minutes of a waqt. A short restart does not
lose alerts — `onStartupRecovery` re-arms any of today's unfired alerts on boot —
but an alert whose time passes while the bot is down is missed.

### 1. Back up the database, outside the repository

```bash
cd /path/to/salah-alert-discord-bot
pm2 stop namaz-bot
mkdir -p ~/namaz-bot-backups
cp -a data/namaz-bot.sqlite  ~/namaz-bot-backups/namaz-bot.$(date +%F-%H%M).sqlite
cp -a data/namaz-bot.sqlite-shm ~/namaz-bot-backups/ 2>/dev/null || true
cp -a data/namaz-bot.sqlite-wal ~/namaz-bot-backups/ 2>/dev/null || true
ls -la ~/namaz-bot-backups/
```

Stop the bot **before** copying, so the copy is not taken mid-write. Copy to a
path outside the repo — a backup inside `data/` is a backup git can still touch.

Also confirm the bot's own daily backups exist, as a second net:

```bash
ls -la data/backups/ | tail
```

### 2. Pull

```bash
git status --short          # expect data/* to show as modified — that is normal
git pull
```

**If the pull aborts** with *"Your local changes to the following files would be
overwritten"* naming only `data/` paths — that is git protecting your database.
You have a verified backup from step 1, so it is safe to clear those paths and
pull:

```bash
git checkout -- data/namaz-bot.sqlite data/namaz-bot.sqlite-shm data/namaz-bot.sqlite-wal
git pull
```

If it names any file **outside** `data/`, stop and look at it — that is a real
local edit on the server, not database churn.

### 3. Restore your database over whatever git left behind

Do this after every pull that touched `data/`, and always after the untracking
commit. From this point on the path is git-ignored, so this is the last time it
matters.

```bash
cp -a ~/namaz-bot-backups/namaz-bot.<the-file-you-just-made>.sqlite data/namaz-bot.sqlite
rm -f data/namaz-bot.sqlite-shm data/namaz-bot.sqlite-wal
ls -la data/
```

Deleting the `-shm` and `-wal` sidecars is correct here: SQLite recreates them,
and a sidecar left over from a *different* database file is worse than none.

### 4. Install, build, restart

```bash
npm ci                      # or: npm install
npm run build               # tsc + copy-assets (migrations, data, assets -> dist/)
pm2 restart namaz-bot
pm2 logs namaz-bot --lines 50
```

Migrations run automatically on boot. Expect log lines for any new migration
file, then `Logged in as <tag>. Guilds: N.`

If `ecosystem.config.js` changed, use `pm2 restart namaz-bot --update-env` —
plain `restart` re-reads `.env` but not the `env:` block.

### 5. Re-register commands, only when the command shape changed

```bash
npm run deploy-commands
```

Needed after any new subcommand, new option, or change to the command's
permissions. With `GUILD_ID` set it is instant; global registration can take up
to an hour. This does not touch the database.

### 6. Verify your configuration survived

In Discord:

```text
/prayer status
```

Check all of it: the alert channel, each waqt's mode and active days, custom
messages showing as `custom` where you set one, and your mute entries. If
anything reads as a default you did not choose, **stop and restore the backup**
(see Rollback) rather than reconfiguring by hand.

---

## This release: Quran quotes

Extra steps for the ayah feature, on top of the checklist above.

- **Migration `003_waqt_quote_toggle.sql`** adds `show_quote` to `waqt_settings`
  with `DEFAULT 0`. Existing rows get `0`, so **nothing changes visibly until you
  opt in**. No other column is touched.
- **`src/data/quran-quotes.json`** must reach `dist/`. `npm run build` handles it
  via `copy-assets`; confirm with `ls -la dist/data/`.
- **Re-register commands** — this release adds `/prayer quote`, so step 5 is
  required.
- **Turn it on** per waqt, or all at once:

  ```text
  /prayer quote waqt:all show:true
  /prayer quote-preview
  ```

- **Roll it back without a deploy:** `/prayer quote waqt:all show:false`. The
  feature is a per-waqt flag in the database, so disabling it needs no restart
  and no code change.

---

## Rollback

**Configuration looks wrong** — restore the database and go back:

```bash
pm2 stop namaz-bot
cp -a ~/namaz-bot-backups/namaz-bot.<timestamp>.sqlite data/namaz-bot.sqlite
rm -f data/namaz-bot.sqlite-shm data/namaz-bot.sqlite-wal
pm2 start namaz-bot
```

**The new code misbehaves** — revert to the previous commit:

```bash
git log --oneline -5
git checkout <previous-commit>
npm ci && npm run build && pm2 restart namaz-bot
```

The migrated database is safe to run against older code: the extra `show_quote`
column is simply never read. You do not need to un-migrate, and there is no
supported way to do so.

---

## Troubleshooting

- **Bot acts newly installed, no channel set.** Almost always pm2 started from
  the wrong directory, so `./data/namaz-bot.sqlite` resolved somewhere else.
  Check `pm2 info namaz-bot` for the exec cwd, then `pm2 delete namaz-bot` and
  start again from the project root. Your real database is untouched — find it
  and confirm before assuming data loss.
- **`git pull` keeps complaining about `data/`.** The untracking commit has not
  reached this checkout yet. Back up, then follow step 2.
- **Commands show the old options.** Run `npm run deploy-commands` again; global
  registration propagates slowly.
- **No alerts posting.** `/prayer status` gives a per-waqt reason — disabled,
  wrong weekday, muted, or no times cached.
- **Quotes not appearing.** Confirm `show_quote` is on for that waqt
  (`/prayer status`), that `dist/data/quran-quotes.json` exists, and check the
  logs — a quote failure is logged and deliberately does not block the alert.
