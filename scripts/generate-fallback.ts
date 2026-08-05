/**
 * One-off generator for src/data/fallback-times.json.
 *
 * Produces a full-year table of prayer times (keyed by "MM-DD") for the
 * configured LAT/LON, sourced from the authoritative Aladhan monthly calendar
 * endpoint (method=1, University of Islamic Sciences Karachi — same as the live
 * primary). A leap year (2028) is used so 02-29 is covered. This file is the
 * final, offline fallback used only when every live/offline source fails.
 *
 * Run:  npx tsx scripts/generate-fallback.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

// Read coordinates directly (not via config/env) so this generator runs without
// the app's required secrets (DISCORD_TOKEN, etc.). Defaults match config/env.ts.
const LAT = Number(process.env.LAT ?? "23.8103");
const LON = Number(process.env.LON ?? "90.4125");

const REFERENCE_YEAR = 2028; // leap year -> includes 02-29
const CALENDAR_URL = "https://api.aladhan.com/v1/calendar";

interface CalendarDay {
  timings: Record<string, string>;
  date: { gregorian: { date: string } }; // "DD-MM-YYYY"
}

function pick(timings: Record<string, string>, name: string): string {
  // Values look like "04:05 (+06)" — keep the leading HH:MM.
  return timings[name].slice(0, 5);
}

async function main(): Promise<void> {
  const table: Record<string, { fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string }> = {};

  for (let month = 1; month <= 12; month++) {
    const url = `${CALENDAR_URL}/${REFERENCE_YEAR}/${month}?latitude=${LAT}&longitude=${LON}&method=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Aladhan calendar ${month} responded ${res.status}`);
    const json = (await res.json()) as { data: CalendarDay[] };

    for (const day of json.data) {
      const [dd, mm] = day.date.gregorian.date.split("-"); // DD-MM-YYYY
      table[`${mm}-${dd}`] = {
        fajr: pick(day.timings, "Fajr"),
        dhuhr: pick(day.timings, "Dhuhr"),
        asr: pick(day.timings, "Asr"),
        maghrib: pick(day.timings, "Maghrib"),
        isha: pick(day.timings, "Isha"),
      };
    }
    process.stdout.write(`month ${month} ok (${json.data.length} days)\n`);
  }

  const outPath = path.join(__dirname, "..", "src", "data", "fallback-times.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const payload = {
    _meta: {
      lat: LAT,
      lon: LON,
      method: 1,
      source: "aladhan-calendar",
      referenceYear: REFERENCE_YEAR,
      keyedBy: "MM-DD",
    },
    times: table,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  process.stdout.write(`Wrote ${Object.keys(table).length} days -> ${outPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
