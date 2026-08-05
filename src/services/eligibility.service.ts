import { GuildConfig, Waqt, WaqtSetting } from "../types/prayer.types";
import { listActiveRangesCoveringDate } from "../db/repositories/muteRange.repo";
import { getActiveDays } from "../db/repositories/waqtSettings.repo";
import { currentWeekday, todayIso } from "../utils/time";

/** True if `isoDate` is covered by an enabled whole-day (windowless) mute range. */
export function isDateFullDayMuted(guildId: string, isoDate: string): boolean {
  return listActiveRangesCoveringDate(guildId, isoDate).some((r) => !r.fromTime || !r.toTime);
}

/**
 * True if an alert at `hhmm` ("HH:MM") on `isoDate` falls inside an enabled
 * time-window ("half day") mute range. HH:MM strings compare lexically.
 */
export function isAlertTimeMuted(guildId: string, isoDate: string, hhmm: string): boolean {
  return listActiveRangesCoveringDate(guildId, isoDate).some(
    (r) => r.fromTime !== null && r.toTime !== null && hhmm >= r.fromTime && hhmm <= r.toTime
  );
}

/**
 * Day-level eligibility for a waqt (independent of its exact alert time):
 * enabled, not muted-today, not on a whole-day mute date, and active this weekday.
 * Time-window mutes are applied separately once the alert time is known
 * (see isAlertTimeMuted).
 */
export function isEligibleToday(
  guildId: string,
  waqt: Waqt,
  setting: WaqtSetting,
  guildConfig: GuildConfig
): boolean {
  if (!setting.enabled) return false;
  if (guildConfig.muteToday) return false;
  if (isDateFullDayMuted(guildId, todayIso())) return false;

  const activeDays = getActiveDays(guildId, waqt);
  if (!activeDays.includes(currentWeekday())) return false;

  return true;
}
