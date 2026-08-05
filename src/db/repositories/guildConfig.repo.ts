import { db } from "../client";
import { GuildConfig } from "../../types/prayer.types";
import { ensureWaqtDefaults } from "./waqtSettings.repo";

interface GuildRow {
  guild_id: string;
  channel_id: string | null;
  admin_log_channel_id: string | null;
  mute_today: number;
}

function mapRow(row: GuildRow): GuildConfig {
  return {
    guildId: row.guild_id,
    channelId: row.channel_id,
    adminLogChannelId: row.admin_log_channel_id,
    muteToday: row.mute_today === 1,
  };
}

export function ensureGuild(guildId: string): GuildConfig {
  db.prepare(`INSERT OR IGNORE INTO guilds (guild_id) VALUES (?)`).run(guildId);
  ensureWaqtDefaults(guildId);
  return getGuildConfig(guildId)!;
}

export function getGuildConfig(guildId: string): GuildConfig | null {
  const row = db.prepare(`SELECT * FROM guilds WHERE guild_id = ?`).get(guildId) as GuildRow | undefined;
  return row ? mapRow(row) : null;
}

export function setChannel(guildId: string, channelId: string): void {
  db.prepare(`UPDATE guilds SET channel_id = ? WHERE guild_id = ?`).run(channelId, guildId);
}

export function setAdminLogChannel(guildId: string, channelId: string | null): void {
  db.prepare(`UPDATE guilds SET admin_log_channel_id = ? WHERE guild_id = ?`).run(channelId, guildId);
}

export function setMuteToday(guildId: string, muted: boolean): void {
  db.prepare(`UPDATE guilds SET mute_today = ? WHERE guild_id = ?`).run(muted ? 1 : 0, guildId);
}

export function resetMuteTodayForAllGuilds(): void {
  db.prepare(`UPDATE guilds SET mute_today = 0`).run();
}

export function listAllGuildIds(): string[] {
  const rows = db.prepare(`SELECT guild_id FROM guilds`).all() as { guild_id: string }[];
  return rows.map((r) => r.guild_id);
}
