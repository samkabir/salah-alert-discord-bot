/**
 * One-off generator for src/data/quran-quotes.json.
 *
 * Reads the curated reference list in scripts/quran-refs.json and fetches the
 * authoritative text for each ayah from AlQuran.cloud (Islamic Network — the
 * same organisation behind the Aladhan prayer-times API this bot already uses):
 *
 *   bn.bengali  মুহিউদ্দীন খান / Muhiuddin Khan
 *   en.sahih    Saheeh International
 *
 * Scripture text is NEVER written by hand — it only ever enters the repo through
 * this script, so every character the bot posts is traceable to a named edition.
 * Cross-check the result against a second independent source with
 * scripts/verify-quotes.ts, and produce the human review document with
 * scripts/export-quotes-review.ts.
 *
 * Run:  npx tsx scripts/generate-quotes.ts
 */
import fs from "node:fs";
import path from "node:path";

const BN_EDITION = "bn.bengali";
const EN_EDITION = "en.sahih";
const API = "https://api.alquran.cloud/v1/ayah";
const REQUEST_GAP_MS = 120; // be polite to a free community API

const root = path.resolve(__dirname, "..");
const refsPath = path.join(root, "scripts/quran-refs.json");
const outPath = path.join(root, "src/data/quran-quotes.json");

interface Ref {
  surah: number;
  ayah: number;
  theme: string;
}

interface ApiEntry {
  text: string;
  edition: { identifier: string; name: string; englishName: string };
  surah: { number: number; name: string; englishName: string; numberOfAyahs: number };
  numberInSurah: number;
}

async function fetchAyah(ref: Ref): Promise<ApiEntry[]> {
  const url = `${API}/${ref.surah}:${ref.ayah}/editions/${BN_EDITION},${EN_EDITION}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${ref.surah}:${ref.ayah} responded ${res.status}`);
  const body = (await res.json()) as { data: ApiEntry[] };
  if (!Array.isArray(body.data) || body.data.length !== 2) {
    throw new Error(`${ref.surah}:${ref.ayah} returned ${body.data?.length ?? 0} editions, expected 2`);
  }
  return body.data;
}

function pick(entries: ApiEntry[], identifier: string, ref: Ref): ApiEntry {
  const found = entries.find((e) => e.edition.identifier === identifier);
  if (!found) throw new Error(`${ref.surah}:${ref.ayah} missing edition ${identifier}`);
  if (!found.text || !found.text.trim()) throw new Error(`${ref.surah}:${ref.ayah} empty text for ${identifier}`);
  return found;
}

async function main(): Promise<void> {
  const refs: Ref[] = JSON.parse(fs.readFileSync(refsPath, "utf8")).refs;
  console.log(`Fetching ${refs.length} ayahs from AlQuran.cloud...`);

  const quotes = [];
  for (const [i, ref] of refs.entries()) {
    const entries = await fetchAyah(ref);
    const bn = pick(entries, BN_EDITION, ref);
    const en = pick(entries, EN_EDITION, ref);

    // The API echoes the ayah it actually served — verify it is the one we asked
    // for, so a silent off-by-one can never reach the bundled file.
    if (bn.surah.number !== ref.surah || bn.numberInSurah !== ref.ayah) {
      throw new Error(
        `Asked for ${ref.surah}:${ref.ayah}, API returned ${bn.surah.number}:${bn.numberInSurah}`
      );
    }

    quotes.push({
      reference: `${ref.surah}:${ref.ayah}`,
      surah: ref.surah,
      ayah: ref.ayah,
      surahNameArabic: bn.surah.name,
      surahNameEnglish: bn.surah.englishName,
      theme: ref.theme,
      bn: bn.text.trim(),
      en: en.text.trim(),
    });

    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${refs.length}`);
    await new Promise((r) => setTimeout(r, REQUEST_GAP_MS));
  }

  const out = {
    source: "https://api.alquran.cloud (Islamic Network)",
    generatedAt: new Date().toISOString(),
    editions: {
      bn: { identifier: BN_EDITION, translator: "মুহিউদ্দীন খান", translatorEnglish: "Muhiuddin Khan" },
      en: { identifier: EN_EDITION, translator: "Saheeh International", translatorEnglish: "Saheeh International" },
    },
    count: quotes.length,
    quotes,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote ${quotes.length} quotes -> ${path.relative(root, outPath)}`);
}

main().catch((err) => {
  console.error("Generation failed:", err);
  process.exit(1);
});
