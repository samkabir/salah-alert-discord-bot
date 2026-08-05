import fs from "node:fs";
import path from "node:path";
import * as schedule from "node-schedule";
import { env } from "../config/env";
import { db } from "../db/client";
import { todayIso } from "../utils/time";

const RETENTION_DAYS = 14;
const BACKUP_PREFIX = "namaz-bot-";
const BACKUP_SUFFIX = ".sqlite";
const BACKUP_NAME_RE = /^namaz-bot-(\d{4}-\d{2}-\d{2})\.sqlite$/;

/** Copy the SQLite DB into BACKUP_DIR with a date-stamped name, then prune old backups. */
export function runBackup(): void {
  if (!fs.existsSync(env.DB_PATH)) {
    console.warn(`[backup] DB file not found at ${env.DB_PATH}, skipping.`);
    return;
  }

  fs.mkdirSync(env.BACKUP_DIR, { recursive: true });

  // Flush the WAL into the main DB file so the copied file is self-consistent.
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch (err) {
    console.warn("[backup] wal_checkpoint failed:", (err as Error).message);
  }

  const dest = path.join(env.BACKUP_DIR, `${BACKUP_PREFIX}${todayIso()}${BACKUP_SUFFIX}`);
  fs.copyFileSync(env.DB_PATH, dest);
  console.log(`[backup] wrote ${dest}`);

  pruneOldBackups();
}

/** Delete backups whose date-stamp is older than RETENTION_DAYS. */
function pruneOldBackups(): void {
  const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toLocaleDateString("en-CA", {
    timeZone: env.TIMEZONE,
  });

  for (const file of fs.readdirSync(env.BACKUP_DIR)) {
    const match = BACKUP_NAME_RE.exec(file);
    if (!match) continue;
    // YYYY-MM-DD strings sort lexically, so a plain comparison is a date comparison.
    if (match[1] < cutoffIso) {
      fs.rmSync(path.join(env.BACKUP_DIR, file));
      console.log(`[backup] pruned ${file}`);
    }
  }
}

export function initBackupSchedule(): void {
  // Run at 00:05 Asia/Dhaka — after the 00:01 daily prayer-times fetch.
  schedule.scheduleJob({ rule: "5 0 * * *", tz: env.TIMEZONE }, () => {
    try {
      runBackup();
    } catch (err) {
      console.error("[backup] failed:", err);
    }
  });
  console.log(`Backup schedule initialized: daily @ 00:05 ${env.TIMEZONE}, ${RETENTION_DAYS}-day retention.`);
}
