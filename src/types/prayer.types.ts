export const WAQTS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export type Waqt = (typeof WAQTS)[number];

export const OFFSET_TYPES = ["start", "before", "after", "fixed"] as const;
export type OffsetType = (typeof OFFSET_TYPES)[number];

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface WaqtSetting {
  guildId: string;
  waqt: Waqt;
  enabled: boolean;
  offsetType: OffsetType;
  offsetValue: number;
  customMessage: string | null;
}

export interface GuildConfig {
  guildId: string;
  channelId: string | null;
  adminLogChannelId: string | null;
  muteToday: boolean;
}

export interface MuteRange {
  id: number;
  guildId: string;
  startDate: string;
  endDate: string;
  enabled: boolean;
  /** HH:MM start of the muted window, or null for a whole-day mute. */
  fromTime: string | null;
  /** HH:MM end of the muted window, or null for a whole-day mute. */
  toTime: string | null;
}

export interface PrayerTimesCache {
  guildId: string;
  date: string;
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  source: string;
}
