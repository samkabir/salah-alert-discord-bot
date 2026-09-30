# Server Deploy Runbook — Quranic Ayah Integration & Database Untracking

Runbook for deploying to the production server:
`SAJIB-DEPLOY:/var/www/salah-alert-discord-bot`.

---

## What this release delivers

1. **Verified Quranic Ayahs**: 150 vetted ayahs (Bangla translation by Muhiuddin Khan, English translation by Saheeh International, Arabic & English surah citations) seamlessly integrated into prayer alerts.
2. **Rich Embed Presentation**: Prayer alerts now display an emerald green embed (`#2B7A4B`) containing the Bangla verse, divider (`—`), English verse, and surah reference footer below the alert text.
3. **Deterministic 30-Day Cycle**: 5 distinct ayahs each day (no repetition within any day), cycling through all 150 ayahs every 30 days.
4. **Permanent Database Untracking (Crucial Safety Fix)**:
   - `data/namaz-bot.sqlite` and `data/Logo.jpg` are now **untracked** from git.
   - `/data/` is added to `.gitignore`.
   - **Benefit**: Git will **never again** risk overwriting, conflicting with, or deleting your production database on future pulls or checkouts.
5. **Zero Reconfiguration Needed**: Migration `003_waqt_quote_toggle.sql` sets `show_quote DEFAULT 1`. Existing channel bindings, custom messages, active days, mute ranges, and timing offsets are untouched.
6. **Alert Timing Unaltered**: Prayer timing calculations and recovery routines are 100% preserved. Existing and upcoming alert schedules fire on exact time.
7. **New Command `/prayer quote`**: Allows administrators to toggle quotes on/off per waqt (`/prayer quote <waqt|all> <show: true|false>`).
8. **Updated `/prayer status`**: Displays `Quote: on` / `Quote: off` for each waqt.

---

## ⚠️ Important Precautions Before Deploying

1. **Deploy outside prayer alert windows**:
   Do not restart the bot within 2–3 minutes of an upcoming waqt alert, so the ~2-second restart doesn't coincide with an in-flight alert.
2. **Node 20 ABI Guard**:
   This server defaults fresh shells to Node 22, but `namaz-bot` under PM2 uses **Node v20.19.0**. `better-sqlite3` is compiled against Node 20 ABI. Always ensure `nvm use 20.19.0` before running any `npm` or build commands.
3. **One-Time Database Transition Sequence**:
   Because this release untracks `data/namaz-bot.sqlite`, **git will attempt to delete the tracked file during `git pull`**. You MUST follow the **Stop → Back Up → Pull → Restore** sequence in Steps 1–3 below. Once completed, the database is permanently untracked and this step is never needed again.

---

## Deployment Steps

### Step 0: Shell Setup & Node Version Check

Run this in your terminal session on the server:

```bash
source /root/.nvm/nvm.sh
nvm use 20.19.0
cd /var/www/salah-alert-discord-bot

node -v    # MUST print v20.19.0 — do NOT proceed if it prints v22
```

---

### Step 1: Stop Bot & Back Up Live Database Outside Repo

Stop the bot first so no writes occur during backup:

```bash
pm2 stop namaz-bot

mkdir -p /root/db-safety

# Checkpoint SQLite WAL and copy database files
node -e "
const db = require('better-sqlite3')('data/namaz-bot.sqlite');
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
"

cp -a data/namaz-bot.sqlite* /root/db-safety/
ls -la /root/db-safety/
```

Confirm that `namaz-bot.sqlite` in `/root/db-safety/` is non-zero in size.

---

### Step 2: Pull the Untracking Commit

Fetch and pull the latest code:

```bash
git fetch origin

# Discard local modifications to the tracked DB file before pulling
git checkout -- data/namaz-bot.sqlite data/Logo.jpg 2>/dev/null || true

git pull origin master
```

> **Note**: During this pull, git deletes the tracked copy of `data/namaz-bot.sqlite`. This is expected because git is transitioning it to an untracked file. In the next step, you will restore your live database from `/root/db-safety/`.

---

### Step 3: Restore Your Live Database

Restore your database from the safety backup back into `data/`:

```bash
cp -a /root/db-safety/namaz-bot.sqlite* data/
ls -la data/
```

Verify that `git status` now shows `data/` as completely clean/ignored (git no longer tracks it!).

---

### Step 4: Build the Application

Build the TypeScript files and copy assets (`migrations`, `data`, `assets`):

```bash
npm run build
```

Expected output:
```
[copy-assets] src/db/migrations -> dist/db/migrations
[copy-assets] src/data -> dist/data
[copy-assets] src/assets -> dist/assets
```

Confirm the new assets exist in `dist/`:
```bash
ls -la dist/data/quran-quotes.json dist/db/migrations/003_waqt_quote_toggle.sql
```

---

### Step 5: Start / Restart the Bot

Start the PM2 process:

```bash
pm2 start namaz-bot
# (or if already configured in pm2: pm2 restart namaz-bot)

pm2 logs namaz-bot --lines 40
```

**Expected Log Output**:
- Migration executed: `003_waqt_quote_toggle.sql`
- `Scheduler initialized: daily fetch @ 00:01 Asia/Dhaka + startup recovery.`
- `Logged in as Salah Prayer Alert Bot#... Guilds: 2.`
- Upcoming alerts for today re-armed at their normal scheduled times.

---

### Step 6: Register the New Slash Command in Discord

Register the updated slash command tree (which adds `/prayer quote`):

```bash
npm run deploy-commands
```

Expected output:
```
Successfully reloaded application (/) commands.
```

---

### Step 7: Verify in Discord

1. Open Discord in your server and type:
   ```text
   /prayer status
   ```
2. Verify:
   - Alert channel is still set correctly.
   - Each waqt shows `Quote: on`.
   - Active days (e.g. Saturday–Thursday, Friday excluded) are intact.
   - Today's upcoming alerts show as `scheduled for HH:MM`.
3. If you ever need to turn off quotes for any waqt:
   ```text
   /prayer quote waqt:all show:false
   ```
   Or turn them back on:
   ```text
   /prayer quote waqt:all show:true
   ```

---

## Permanent Gain After This Deploy

From this point forward:
- `data/` is permanently in `.gitignore`.
- Future deployments simply do:
  ```bash
  git pull origin master
  npm run build
  pm2 restart namaz-bot
  ```
  No database gymnastics, no conflict warnings, and zero risk of accidental database overwrites.

---

## Rollback Procedure (If Needed)

1. **Restore Code**:
   ```bash
   git log --oneline -5
   git checkout 437bf6c    # previous master commit
   npm run build
   pm2 restart namaz-bot
   ```
2. **Database Compatibility**:
   The migration `003_waqt_quote_toggle.sql` is purely additive. Older code simply ignores the `show_quote` column, so no database downgrade is necessary.
3. **If Database Needs Restoration**:
   ```bash
   pm2 stop namaz-bot
   cp -a /root/db-safety/namaz-bot.sqlite* data/
   pm2 start namaz-bot
   ```
