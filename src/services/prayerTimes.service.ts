import fs from "node:fs";
import path from "node:path";
import { Client } from "discord.js";
import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from "adhan";
import { Waqt } from "../types/prayer.types";
import { env } from "../config/env";
import { formatTimeInZone } from "../utils/time";
import { logFallbackUsage } from "./logger.service";

export interface FetchedPrayerTimes {
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  source: string;
}

const ALADHAN_URL = "https://api.aladhan.com/v1/timings";
const ALADHAN_METHOD = 1; // University of Islamic Sciences, Karachi

/** Time zone-aware calendar date of `date` as "YYYY-MM-DD" (en-CA) plus "DD-MM-YYYY". */
function zonedDateParts(date: Date): { iso: string; ddmmyyyy: string } {
  const iso = date.toLocaleDateString("en-CA", { timeZone: env.TIMEZONE }); // YYYY-MM-DD
  const [y, m, d] = iso.split("-");
  return { iso, ddmmyyyy: `${d}-${m}-${y}` };
}

function mapAladhanTimings(t: Record<string, string>, source: string): FetchedPrayerTimes {
  return {
    fajr: t.Fajr.slice(0, 5),
    dhuhr: t.Dhuhr.slice(0, 5),
    asr: t.Asr.slice(0, 5),
    maghrib: t.Maghrib.slice(0, 5),
    isha: t.Isha.slice(0, 5),
    source,
  };
}

// ---- Primary: Aladhan by UNIX timestamp -------------------------------------
async function fetchFromAladhan(lat: number, lon: number, date: Date): Promise<FetchedPrayerTimes> {
  const timestamp = Math.floor(date.getTime() / 1000);
  const url = `${ALADHAN_URL}/${timestamp}?latitude=${lat}&longitude=${lon}&method=${ALADHAN_METHOD}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Aladhan responded ${res.status}`);
  const data = (await res.json()) as { data: { timings: Record<string, string> } };
  return mapAladhanTimings(data.data.timings, "aladhan");
}

// ---- Secondary: Aladhan by DD-MM-YYYY date path (distinct endpoint) ----------
async function fetchFromAladhanByDate(lat: number, lon: number, date: Date): Promise<FetchedPrayerTimes> {
  const { ddmmyyyy } = zonedDateParts(date);
  const url = `${ALADHAN_URL}/${ddmmyyyy}?latitude=${lat}&longitude=${lon}&method=${ALADHAN_METHOD}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Aladhan (by date) responded ${res.status}`);
  const data = (await res.json()) as { data: { timings: Record<string, string> } };
  return mapAladhanTimings(data.data.timings, "aladhan-date");
}

// ---- Tertiary: offline astronomical computation (no network, no key) ---------
function computeOffline(lat: number, lon: number, date: Date): FetchedPrayerTimes {
  const { iso } = zonedDateParts(date);
  const [y, m, d] = iso.split("-").map(Number);
  const coordinates = new Coordinates(lat, lon);
  const params = CalculationMethod.Karachi(); // matches Aladhan method=1
  params.madhab = Madhab.Shafi; // matches Aladhan default school (Shafi)
  // Construct with local Y/M/D components so adhan computes for the intended calendar day.
  const times = new PrayerTimes(coordinates, new Date(y, m - 1, d), params);
  return {
    fajr: formatTimeInZone(times.fajr),
    dhuhr: formatTimeInZone(times.dhuhr),
    asr: formatTimeInZone(times.asr),
    maghrib: formatTimeInZone(times.maghrib),
    isha: formatTimeInZone(times.isha),
    source: "offline-calc",
  };
}

// ---- Static: bundled precomputed table (final fallback) ----------------------
interface FallbackFile {
  times: Record<string, { fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string }>;
}

let staticTable: FallbackFile["times"] | null = null;

function loadStaticTable(): FallbackFile["times"] {
  if (staticTable) return staticTable;
  const filePath = path.join(__dirname, "..", "data", "fallback-times.json");
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as FallbackFile;
  staticTable = parsed.times;
  return staticTable;
}

function fromStaticFallback(date: Date): FetchedPrayerTimes {
  const { iso } = zonedDateParts(date);
  const key = iso.slice(5); // MM-DD
  const table = loadStaticTable();
  const entry = table[key] ?? table["02-28"]; // 02-29 guard for non-leap tables
  if (!entry) throw new Error(`No static fallback entry for ${key}`);
  return { ...entry, source: "static-fallback" };
}

/**
 * Fetch prayer times for `date`, trying primary -> secondary -> tertiary -> static.
 * Returns the times plus which `source` succeeded. Whenever a non-primary source
 * is used, logFallbackUsage() is invoked so admins are notified.
 */
export async function fetchPrayerTimes(
  client: Client,
  guildId: string,
  date: Date
): Promise<FetchedPrayerTimes> {
  const lat = env.LAT;
  const lon = env.LON;

  // Primary
  try {
    return await fetchFromAladhan(lat, lon, date);
  } catch (primaryErr) {
    console.warn("[prayerTimes] primary (aladhan) failed:", (primaryErr as Error).message);
  }

  // Secondary
  try {
    const result = await fetchFromAladhanByDate(lat, lon, date);
    await logFallbackUsage(client, guildId, result.source);
    return result;
  } catch (secondaryErr) {
    console.warn("[prayerTimes] secondary (aladhan-date) failed:", (secondaryErr as Error).message);
  }

  // Tertiary
  try {
    const result = computeOffline(lat, lon, date);
    await logFallbackUsage(client, guildId, result.source);
    return result;
  } catch (tertiaryErr) {
    console.warn("[prayerTimes] tertiary (offline-calc) failed:", (tertiaryErr as Error).message);
  }

  // Static (last resort) — allowed to throw if even this fails.
  const result = fromStaticFallback(date);
  await logFallbackUsage(client, guildId, result.source);
  return result;
}

export function waqtKeys(): Waqt[] {
  return ["fajr", "dhuhr", "asr", "maghrib", "isha"];
}
