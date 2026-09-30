import fs from "node:fs";
import path from "node:path";
import { EmbedBuilder } from "discord.js";
import { Waqt, WAQTS } from "../types/prayer.types";

export interface QuranQuote {
  reference: string;
  surah: number;
  ayah: number;
  surahNameArabic: string;
  surahNameEnglish: string;
  theme: string;
  bn: string;
  en: string;
}

interface QuotesFile {
  source: string;
  generatedAt: string;
  count: number;
  quotes: QuranQuote[];
}

let cachedQuotes: QuranQuote[] | null = null;

function loadQuotes(): QuranQuote[] {
  if (cachedQuotes !== null) return cachedQuotes;

  const filePath = path.join(__dirname, "..", "data", "quran-quotes.json");
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`[quote] File not found: ${filePath}`);
      cachedQuotes = [];
      return cachedQuotes;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as QuotesFile;
    cachedQuotes = parsed.quotes || [];
    return cachedQuotes;
  } catch (err) {
    console.error("[quote] Failed to load quran-quotes.json:", err);
    cachedQuotes = [];
    return cachedQuotes;
  }
}

/**
 * Deterministically pick an ayah quote for a given date and waqt.
 *
 * 5 ayahs per day across 150 ayahs = 30-day non-repeating cycle.
 * Being purely deterministic based on the calendar date, the selection
 * requires no database tracking and remains identical across server reboots.
 */
export function getQuoteForWaqt(isoDate: string, waqt: Waqt): QuranQuote | null {
  const quotes = loadQuotes();
  if (quotes.length === 0) return null;

  const waqtIndex = WAQTS.indexOf(waqt);
  if (waqtIndex === -1) return null;

  const [y, m, d] = isoDate.split("-").map(Number);
  const epochDays = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  const index = Math.abs(epochDays * 5 + waqtIndex) % quotes.length;

  return quotes[index];
}

/**
 * Build a Discord embed for the given ayah quote.
 * Emerald green border (#2B7A4B), Bangla text, divider, English text,
 * and surah citation in the footer.
 */
export function buildQuoteEmbed(quote: QuranQuote): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x2b7a4b)
    .setDescription(`${quote.bn}\n\n—\n\n${quote.en}`)
    .setFooter({
      text: `Surah ${quote.surahNameEnglish} ${quote.reference} • ${quote.surahNameArabic}`,
    });
}
