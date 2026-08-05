import { EmbedBuilder } from "discord.js";
import { PrayerSubcommand } from "../types";
import { GuildConfig, PrayerTimesCache, Waqt, WaqtSetting } from "../../types/prayer.types";
import { getGuildConfig } from "../../db/repositories/guildConfig.repo";
import { getAllWaqtSettings, getActiveDays } from "../../db/repositories/waqtSettings.repo";
import { listMuteRanges } from "../../db/repositories/muteRange.repo";
import { getCachedTimes, hasFired } from "../../db/repositories/fireLog.repo";
import { computeAlertDate } from "../../services/scheduler.service";
import { isDateFullDayMuted, isAlertTimeMuted } from "../../services/eligibility.service";
import { describeRange } from "./mute";
import { currentWeekday, formatTimeInZone, todayIso } from "../../utils/time";

/** Describe when/whether a waqt's alert will run today (used in the status embed). */
function alertStateLine(
  guildId: string,
  waqt: Waqt,
  setting: WaqtSetting,
  config: GuildConfig,
  cache: PrayerTimesCache | null,
  iso: string
): string {
  if (!setting.enabled) return "disabled";
  if (!cache) return "no times cached yet";

  const alertDate = computeAlertDate(iso, cache, setting, waqt);
  const at = formatTimeInZone(alertDate);

  if (hasFired(guildId, waqt, iso)) return `fired ✓ (${at})`;
  if (config.muteToday) return `muted today (would be ${at})`;
  if (isDateFullDayMuted(guildId, iso)) return `muted all day (would be ${at})`;
  if (!getActiveDays(guildId, waqt).includes(currentWeekday())) return `off today — weekday (would be ${at})`;
  if (isAlertTimeMuted(guildId, iso, at)) return `muted — time window (would be ${at})`;
  if (alertDate.getTime() <= Date.now()) return `passed (${at})`;
  return `scheduled for ${at}`;
}

export const statusCommand: PrayerSubcommand = {
  name: "status",
  build: (sub) => sub.setName("status").setDescription("Show full current alert configuration"),
  execute: async (interaction) => {
    const guildId = interaction.guildId!;
    const config = getGuildConfig(guildId);
    const settings = getAllWaqtSettings(guildId);
    const ranges = listMuteRanges(guildId);
    const iso = todayIso();
    const cache = getCachedTimes(guildId, iso);

    const embed = new EmbedBuilder()
      .setTitle("Prayer Alert Configuration")
      .setColor(0x2b7a4b)
      .addFields(
        {
          name: "Channel",
          value: config?.channelId ? `<#${config.channelId}>` : "Not set",
          inline: true,
        },
        {
          name: "Muted today",
          value: config?.muteToday ? "Yes" : "No",
          inline: true,
        },
        {
          name: `Today's times (${iso})`,
          value: cache
            ? `source: **${cache.source}**\n` +
              `Fajr ${cache.fajr} · Dhuhr ${cache.dhuhr} · Asr ${cache.asr} · ` +
              `Maghrib ${cache.maghrib} · Isha ${cache.isha}`
            : "Not cached yet (fetched at 00:01 or on startup).",
        },
        {
          name: "Mute entries",
          value: ranges.length > 0 ? ranges.map(describeRange).join("\n") : "None",
        }
      );

    for (const setting of settings) {
      const days = getActiveDays(guildId, setting.waqt);
      const offsetDesc =
        setting.offsetType === "start"
          ? "at start time"
          : setting.offsetType === "fixed"
            ? `at fixed ${String(Math.floor(setting.offsetValue / 60)).padStart(2, "0")}:${String(
                setting.offsetValue % 60
              ).padStart(2, "0")}`
            : `${setting.offsetValue} min ${setting.offsetType} start`;

      const state = config ? alertStateLine(guildId, setting.waqt, setting, config, cache, iso) : "—";

      const waqtLabel = setting.waqt.charAt(0).toUpperCase() + setting.waqt.slice(1);
      embed.addFields({
        name: `${waqtLabel} — ${setting.enabled ? "enabled" : "disabled"}`,
        value:
          `Mode: ${offsetDesc}\n` +
          `Today: ${state}\n` +
          `Days: ${days.join(", ")}\n` +
          `Message: ${setting.customMessage ? "custom" : "default"}`,
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
