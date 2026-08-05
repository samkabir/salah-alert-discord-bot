import { db } from "../client";
import { OffsetType, WAQTS, Waqt, WaqtSetting, WEEKDAYS, Weekday } from "../../types/prayer.types";

interface WaqtRow {
  guild_id: string;
  waqt: Waqt;
  enabled: number;
  offset_type: OffsetType;
  offset_value: number;
  custom_message: string | null;
}

function mapRow(row: WaqtRow): WaqtSetting {
  return {
    guildId: row.guild_id,
    waqt: row.waqt,
    enabled: row.enabled === 1,
    offsetType: row.offset_type,
    offsetValue: row.offset_value,
    customMessage: row.custom_message,
  };
}

export function ensureWaqtDefaults(guildId: string): void {
  const insertWaqt = db.prepare(
    `INSERT OR IGNORE INTO waqt_settings (guild_id, waqt) VALUES (?, ?)`
  );
  const insertDay = db.prepare(
    `INSERT OR IGNORE INTO active_days (guild_id, waqt, weekday) VALUES (?, ?, ?)`
  );
  const tx = db.transaction(() => {
    for (const waqt of WAQTS) {
      insertWaqt.run(guildId, waqt);
      for (const day of WEEKDAYS) insertDay.run(guildId, waqt, day);
    }
  });
  tx();
}

export function getWaqtSetting(guildId: string, waqt: Waqt): WaqtSetting | null {
  const row = db
    .prepare(`SELECT * FROM waqt_settings WHERE guild_id = ? AND waqt = ?`)
    .get(guildId, waqt) as WaqtRow | undefined;
  return row ? mapRow(row) : null;
}

export function getAllWaqtSettings(guildId: string): WaqtSetting[] {
  // Return in canonical daily order (Fajr, Dhuhr, Asr, Maghrib, Isha), not alphabetical.
  const rows = db
    .prepare(
      `SELECT * FROM waqt_settings WHERE guild_id = ?
       ORDER BY CASE waqt
         WHEN 'fajr' THEN 1
         WHEN 'dhuhr' THEN 2
         WHEN 'asr' THEN 3
         WHEN 'maghrib' THEN 4
         WHEN 'isha' THEN 5
         ELSE 6
       END`
    )
    .all(guildId) as WaqtRow[];
  return rows.map(mapRow);
}

export function toggleWaqt(guildId: string, waqt: Waqt, enabled: boolean): void {
  db.prepare(
    `UPDATE waqt_settings SET enabled = ? WHERE guild_id = ? AND waqt = ?`
  ).run(enabled ? 1 : 0, guildId, waqt);
}

export function setOffset(guildId: string, waqt: Waqt, offsetType: OffsetType, offsetValue: number): void {
  db.prepare(
    `UPDATE waqt_settings SET offset_type = ?, offset_value = ? WHERE guild_id = ? AND waqt = ?`
  ).run(offsetType, offsetValue, guildId, waqt);
}

export function setCustomMessage(guildId: string, waqt: Waqt, message: string | null): void {
  db.prepare(
    `UPDATE waqt_settings SET custom_message = ? WHERE guild_id = ? AND waqt = ?`
  ).run(message, guildId, waqt);
}

export function getActiveDays(guildId: string, waqt: Waqt): Weekday[] {
  const rows = db
    .prepare(`SELECT weekday FROM active_days WHERE guild_id = ? AND waqt = ?`)
    .all(guildId, waqt) as { weekday: Weekday }[];
  return rows.map((r) => r.weekday);
}

export function setActiveDays(guildId: string, waqts: Waqt[], days: Weekday[]): void {
  const del = db.prepare(`DELETE FROM active_days WHERE guild_id = ? AND waqt = ?`);
  const insert = db.prepare(`INSERT INTO active_days (guild_id, waqt, weekday) VALUES (?, ?, ?)`);
  const tx = db.transaction(() => {
    for (const waqt of waqts) {
      del.run(guildId, waqt);
      for (const day of days) insert.run(guildId, waqt, day);
    }
  });
  tx();
}
