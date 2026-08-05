import { db } from "../client";
import { MuteRange } from "../../types/prayer.types";

interface MuteRangeRow {
  id: number;
  guild_id: string;
  start_date: string;
  end_date: string;
  enabled: number;
  from_time: string | null;
  to_time: string | null;
}

function mapRow(row: MuteRangeRow): MuteRange {
  return {
    id: row.id,
    guildId: row.guild_id,
    startDate: row.start_date,
    endDate: row.end_date,
    enabled: row.enabled === 1,
    fromTime: row.from_time,
    toTime: row.to_time,
  };
}

/** Insert a mute range (single day => startDate === endDate). Returns the new row id. */
export function addMuteRange(
  guildId: string,
  startDate: string,
  endDate: string,
  fromTime: string | null = null,
  toTime: string | null = null
): number {
  const result = db
    .prepare(
      `INSERT INTO mute_ranges (guild_id, start_date, end_date, from_time, to_time)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(guildId, startDate, endDate, fromTime, toTime);
  return Number(result.lastInsertRowid);
}

export function listMuteRanges(guildId: string): MuteRange[] {
  const rows = db
    .prepare(`SELECT * FROM mute_ranges WHERE guild_id = ? ORDER BY start_date, id`)
    .all(guildId) as MuteRangeRow[];
  return rows.map(mapRow);
}

/** Enabled ranges (of any kind) whose date span covers `isoDate`. */
export function listActiveRangesCoveringDate(guildId: string, isoDate: string): MuteRange[] {
  const rows = db
    .prepare(
      `SELECT * FROM mute_ranges
       WHERE guild_id = ? AND enabled = 1 AND ? BETWEEN start_date AND end_date
       ORDER BY start_date, id`
    )
    .all(guildId, isoDate) as MuteRangeRow[];
  return rows.map(mapRow);
}

/** Set a single range's enabled flag. Returns true if a row was updated. */
export function setMuteRangeEnabled(guildId: string, id: number, enabled: boolean): boolean {
  const result = db
    .prepare(`UPDATE mute_ranges SET enabled = ? WHERE guild_id = ? AND id = ?`)
    .run(enabled ? 1 : 0, guildId, id);
  return result.changes > 0;
}

/** Delete a single range by id. Returns true if a row was removed. */
export function removeMuteRange(guildId: string, id: number): boolean {
  const result = db
    .prepare(`DELETE FROM mute_ranges WHERE guild_id = ? AND id = ?`)
    .run(guildId, id);
  return result.changes > 0;
}

export function removeMuteRangesCoveringDate(guildId: string, isoDate: string): number {
  const result = db
    .prepare(`DELETE FROM mute_ranges WHERE guild_id = ? AND ? BETWEEN start_date AND end_date`)
    .run(guildId, isoDate);
  return result.changes;
}

export function clearAllMuteRanges(guildId: string): void {
  db.prepare(`DELETE FROM mute_ranges WHERE guild_id = ?`).run(guildId);
}
