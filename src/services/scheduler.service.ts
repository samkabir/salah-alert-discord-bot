import * as schedule from "node-schedule";
import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { env } from "../config/env";
import { Waqt, WaqtSetting, PrayerTimesCache } from "../types/prayer.types";
import {
  listAllGuildIds,
  getGuildConfig,
  resetMuteTodayForAllGuilds,
} from "../db/repositories/guildConfig.repo";
import {
  getCachedTimes,
  setCachedTimes,
  hasFired,
  markFired,
} from "../db/repositories/fireLog.repo";
import { getWaqtSetting } from "../db/repositories/waqtSettings.repo";
import { isEligibleToday, isAlertTimeMuted } from "./eligibility.service";
import { fetchPrayerTimes, waqtKeys } from "./prayerTimes.service";
import { logError } from "./logger.service";
import { todayIso, zonedTimeToDate, formatTimeInZone } from "../utils/time";

const DEFAULT_MESSAGE = "🕌 It's time for **{waqt}** ({time}).";

/** Fill {waqt}/{time} placeholders in a (custom or default) alert message. */
function renderMessage(template: string | null, waqt: Waqt, time: string): string {
  const nice = waqt.charAt(0).toUpperCase() + waqt.slice(1);
  return (template ?? DEFAULT_MESSAGE).replaceAll("{waqt}", nice).replaceAll("{time}", time);
}

/**
 * Compute the absolute alert Date for a waqt from its cached start time and
 * offset configuration, interpreted in the configured TIMEZONE.
 */
export function computeAlertDate(iso: string, cache: PrayerTimesCache, setting: WaqtSetting, waqt: Waqt): Date {
  if (setting.offsetType === "fixed") {
    const hours = Math.floor(setting.offsetValue / 60);
    const minutes = setting.offsetValue % 60;
    return zonedTimeToDate(iso, hours, minutes);
  }

  const [sh, sm] = cache[waqt].split(":").map(Number);
  const base = zonedTimeToDate(iso, sh, sm);
  if (setting.offsetType === "before") return new Date(base.getTime() - setting.offsetValue * 60_000);
  if (setting.offsetType === "after") return new Date(base.getTime() + setting.offsetValue * 60_000);
  return base; // "start"
}

const ALERT_JOB_PREFIX = "alert:";

/** Stable name for a guild's one-off alert job on a given date. */
function alertJobName(guildId: string, waqt: Waqt, iso: string): string {
  return `${ALERT_JOB_PREFIX}${guildId}:${waqt}:${iso}`;
}

/**
 * Cancel every armed alert job for one guild. node-schedule's `cancel()` clears the
 * timer *and* removes the name from `scheduledJobs`, so the duplicate-name guard in
 * `scheduleOneOffAlert` will not block the re-arm that follows.
 */
function cancelGuildAlerts(guildId: string): void {
  const prefix = `${ALERT_JOB_PREFIX}${guildId}:`;
  for (const [name, job] of Object.entries(schedule.scheduledJobs)) {
    if (name.startsWith(prefix)) job.cancel();
  }
}

/** Schedule a single one-off alert job that posts the embed and marks it fired. */
function scheduleOneOffAlert(
  client: Client,
  guildId: string,
  waqt: Waqt,
  setting: WaqtSetting,
  startTime: string,
  alertDate: Date,
  iso: string
): void {
  const jobName = alertJobName(guildId, waqt, iso);
  if (schedule.scheduledJobs[jobName]) return; // already scheduled this run

  schedule.scheduleJob(jobName, alertDate, async () => {
    // Re-check at fire time: skip if it fired in the meantime (crash/overlap safety).
    if (hasFired(guildId, waqt, iso)) return;

    // Re-read the setting too, so a message edit or a disable lands even on a job
    // that was armed before the change.
    const current = getWaqtSetting(guildId, waqt) ?? setting;
    if (!current.enabled) return;

    const config = getGuildConfig(guildId);
    if (!config?.channelId) {
      await logError(client, guildId, `alert:${waqt}`, new Error("No alert channel configured"));
      return;
    }

    try {
      const channel = await client.channels.fetch(config.channelId);
      if (!(channel instanceof TextChannel)) {
        throw new Error(`Channel ${config.channelId} is not a text channel`);
      }

      const embed = new EmbedBuilder()
        .setColor(0x2b7a4b)
        .setTitle(`${waqt.charAt(0).toUpperCase() + waqt.slice(1)} — ${startTime}`)
        .setDescription(renderMessage(current.customMessage, waqt, startTime))
        .setTimestamp();

      await channel.send({ embeds: [embed] });
      markFired(guildId, waqt, iso);
    } catch (err) {
      await logError(client, guildId, `alert:${waqt}`, err);
    }
  });
}

/**
 * Schedule all of today's remaining, eligible alerts for one guild from its
 * cached prayer times. Safe to call multiple times: past/already-fired/duplicate
 * jobs are skipped.
 */
export function scheduleTodayAlerts(client: Client, guildId: string): void {
  const iso = todayIso();
  const cache = getCachedTimes(guildId, iso);
  if (!cache) return; // no times cached yet — nothing to schedule

  const config = getGuildConfig(guildId);
  if (!config) return;

  for (const waqt of waqtKeys()) {
    const setting = getWaqtSetting(guildId, waqt);
    if (!setting) continue;
    if (!isEligibleToday(guildId, waqt, setting, config)) continue;

    const alertDate = computeAlertDate(iso, cache, setting, waqt);
    if (alertDate.getTime() <= Date.now()) continue; // already in the past
    if (hasFired(guildId, waqt, iso)) continue; // already fired today
    if (isAlertTimeMuted(guildId, iso, formatTimeInZone(alertDate))) continue; // within a mute window

    scheduleOneOffAlert(client, guildId, waqt, setting, cache[waqt], alertDate, iso);
  }
}

/**
 * Re-arm a guild's alerts from its *current* settings. Config commands must call
 * this after writing to the DB: a job bakes in its fire time when it is armed, so
 * a DB write on its own leaves the stale job running and firing at the old time.
 */
export function rescheduleGuildAlerts(client: Client, guildId: string): void {
  cancelGuildAlerts(guildId);
  scheduleTodayAlerts(client, guildId);
}

/** Fetch + cache today's times for a guild, then (re)schedule its alerts. */
async function fetchCacheAndSchedule(client: Client, guildId: string, iso: string, when: Date): Promise<void> {
  const times = await fetchPrayerTimes(client, guildId, when);
  setCachedTimes({ guildId, date: iso, ...times });
  scheduleTodayAlerts(client, guildId);
}

/**
 * Daily cron at 00:01 Asia/Dhaka: reset per-day mute, fetch+cache times for
 * every guild, then schedule that day's alerts.
 */
export function scheduleDailyFetchJob(client: Client): void {
  schedule.scheduleJob({ rule: "1 0 * * *", tz: env.TIMEZONE }, async () => {
    const iso = todayIso();
    const now = new Date();
    resetMuteTodayForAllGuilds(); // fresh day — clear one-off mutes before scheduling
    for (const guildId of listAllGuildIds()) {
      try {
        await fetchCacheAndSchedule(client, guildId, iso, now);
      } catch (err) {
        await logError(client, guildId, "dailyFetch", err);
      }
    }
  });
}

/**
 * On boot: for every known guild ensure today's times are cached (fetch if
 * missing) and (re)schedule any alerts that haven't fired yet, so a mid-day
 * crash/restart doesn't drop the remaining alerts.
 */
export async function onStartupRecovery(client: Client): Promise<void> {
  const iso = todayIso();
  const now = new Date();
  for (const guildId of listAllGuildIds()) {
    try {
      if (getCachedTimes(guildId, iso)) {
        scheduleTodayAlerts(client, guildId);
      } else {
        await fetchCacheAndSchedule(client, guildId, iso, now);
      }
    } catch (err) {
      await logError(client, guildId, "startupRecovery", err);
    }
  }
}

export function initScheduler(client: Client): void {
  scheduleDailyFetchJob(client);
  void onStartupRecovery(client).catch((err) => logError(client, null, "startupRecovery", err));
  console.log(`Scheduler initialized: daily fetch @ 00:01 ${env.TIMEZONE} + startup recovery.`);
}
