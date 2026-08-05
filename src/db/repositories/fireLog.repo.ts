import { db } from "../client";
import { PrayerTimesCache, Waqt } from "../../types/prayer.types";

export function hasFired(guildId: string, waqt: Waqt, fireDate: string): boolean {
  const row = db
    .prepare(`SELECT 1 FROM fire_log WHERE guild_id = ? AND waqt = ? AND fire_date = ?`)
    .get(guildId, waqt, fireDate);
  return !!row;
}

export function markFired(guildId: string, waqt: Waqt, fireDate: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO fire_log (guild_id, waqt, fire_date) VALUES (?, ?, ?)`
  ).run(guildId, waqt, fireDate);
}

interface CacheRow {
  guild_id: string;
  date: string;
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  source: string;
}

function mapCacheRow(row: CacheRow): PrayerTimesCache {
  return {
    guildId: row.guild_id,
    date: row.date,
    fajr: row.fajr,
    dhuhr: row.dhuhr,
    asr: row.asr,
    maghrib: row.maghrib,
    isha: row.isha,
    source: row.source,
  };
}

export function getCachedTimes(guildId: string, date: string): PrayerTimesCache | null {
  const row = db
    .prepare(`SELECT * FROM prayer_times_cache WHERE guild_id = ? AND date = ?`)
    .get(guildId, date) as CacheRow | undefined;
  return row ? mapCacheRow(row) : null;
}

export function setCachedTimes(cache: PrayerTimesCache): void {
  db.prepare(
    `INSERT INTO prayer_times_cache (guild_id, date, fajr, dhuhr, asr, maghrib, isha, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, date) DO UPDATE SET
       fajr = excluded.fajr, dhuhr = excluded.dhuhr, asr = excluded.asr,
       maghrib = excluded.maghrib, isha = excluded.isha, source = excluded.source`
  ).run(
    cache.guildId,
    cache.date,
    cache.fajr,
    cache.dhuhr,
    cache.asr,
    cache.maghrib,
    cache.isha,
    cache.source
  );
}
