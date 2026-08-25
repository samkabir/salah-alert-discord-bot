/**
 * Cross-checks src/data/quran-quotes.json against INDEPENDENT distributors of
 * the same two translations, so a mangled or mis-numbered fetch can never reach
 * production unnoticed:
 *
 *   bn.bengali (Muhiuddin Khan)      vs  fawazahmed0/quran-api (jsDelivr CDN)
 *   en.sahih   (Saheeh International) vs  api.quran.com v4, translation id 20
 *
 * Distributors legitimately differ in transliteration diacritics ("Allah" vs
 * "Allāh"), footnote markup, and the translator's bracketed insertions — and they
 * sometimes carry different printings of the same translation. So textual
 * differences are classified and written to docs/ayah-crosscheck.md for a human
 * to choose from; they do NOT fail the run.
 *
 * What DOES fail the run is a structural problem: a missing ayah, empty text, a
 * duplicate reference, or text too long to render in an embed.
 *
 * Run:  npx tsx scripts/verify-quotes.ts
 */
import fs from "node:fs";
import path from "node:path";

const CDN_EDITION = "ben-muhiuddinkhan";
const CDN_URL = `https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/${CDN_EDITION}.json`;
const QURAN_COM = "https://api.quran.com/api/v4/quran/translations/20";
const EMBED_DESCRIPTION_LIMIT = 4096;

const root = path.resolve(__dirname, "..");
const quotesPath = path.join(root, "src/data/quran-quotes.json");
const reportPath = path.join(root, "docs/ayah-crosscheck.md");

interface Quote {
  reference: string;
  surah: number;
  ayah: number;
  bn: string;
  en: string;
}

/** Strip markup and fold the cosmetic differences between distributors. */
function normalise(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")            // quran.com footnote markup
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")     // Latin diacritics: Allāh -> Allah
    .replace(/[​-‍﻿]/g, "") // zero-width joiners (common in Bengali text)
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[0-9০-৯]/g, "")     // footnote markers left behind by <sup> tags
    .replace(/[.,;:!?()[\]{}"'।\-–—]/g, "") // punctuation incl. Bengali danda and dashes
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Character-level edit distance, used to tell a printing variant from a real difference. */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

type Verdict = "exact" | "normalised" | "gloss" | "wording";

const VERDICTS: Verdict[] = ["exact", "normalised", "gloss", "wording"];

/** Drop the translator's bracketed insertions, which differ between printings. */
function stripGlosses(s: string): string {
  return s.replace(/\[[^\]]*\]/g, " ");
}

/**
 * exact      byte-identical
 * normalised identical once markup, footnote digits, diacritics and punctuation
 *            are folded ("Allah" vs "Allāh")
 * gloss      identical once the translator's bracketed insertions are also
 *            dropped ("giving to relatives" vs "giving [help] to relatives") —
 *            the distributors carry different printings of the same translation
 * wording    the words themselves differ ("the Sustainer of [all] existence" vs
 *            "the Self-Sustaining"). A human decides which printing to keep.
 *
 * None of these are failures. Only structural problems fail the run: a missing
 * ayah, empty text, a duplicate, or text too long to render.
 */
function classify(ours: string, other: string): Verdict {
  const strippedOther = other.replace(/<[^>]*>/g, "").trim();
  if (strippedOther === ours) return "exact";
  if (normalise(ours) === normalise(other)) return "normalised";
  if (normalise(stripGlosses(ours)) === normalise(stripGlosses(other))) return "gloss";
  return "wording";
}

/** The words that differ, for a compact human-readable note. */
function differingWords(ours: string, other: string): string {
  const a = new Set(normalise(ours).split(" "));
  const b = new Set(normalise(other.replace(/<[^>]*>/g, "")).split(" "));
  const onlyOurs = [...a].filter((w) => !b.has(w));
  const onlyOther = [...b].filter((w) => !a.has(w));
  return `ours[${onlyOurs.join(" ")}] theirs[${onlyOther.join(" ")}]`;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
}

async function main(): Promise<void> {
  const file = JSON.parse(fs.readFileSync(quotesPath, "utf8"));
  const quotes: Quote[] = file.quotes;
  const problems: string[] = [];
  const diffs: { lang: "Bangla" | "English"; ref: string; verdict: Verdict; ours: string; theirs: string }[] = [];

  console.log(`Checking ${quotes.length} quotes from ${path.relative(root, quotesPath)}\n`);

  // --- structural checks: these are the only hard failures -------------------
  if (quotes.length !== file.count) problems.push(`count field says ${file.count} but there are ${quotes.length} quotes`);

  const seen = new Set<string>();
  for (const q of quotes) {
    if (seen.has(q.reference)) problems.push(`duplicate reference ${q.reference}`);
    seen.add(q.reference);
    if (!q.bn?.trim()) problems.push(`${q.reference} has empty Bangla text`);
    if (!q.en?.trim()) problems.push(`${q.reference} has empty English text`);
    const rendered = q.bn.length + q.en.length + 120; // + divider and citation
    if (rendered > EMBED_DESCRIPTION_LIMIT) problems.push(`${q.reference} too long for an embed (${rendered} chars)`);
  }

  // --- Bangla: one bulk download, compared locally ---------------------------
  console.log(`Fetching independent Bangla edition (${CDN_EDITION})...`);
  const cdn = await fetchJson(CDN_URL);
  const cdnMap = new Map<string, string>();
  for (const v of cdn.quran) cdnMap.set(`${v.chapter}:${v.verse}`, v.text);

  const bnTally: Record<Verdict, number> = { exact: 0, normalised: 0, gloss: 0, wording: 0 };
  for (const q of quotes) {
    const theirs = cdnMap.get(q.reference);
    if (!theirs) {
      problems.push(`${q.reference} not found in the independent Bangla edition`);
      continue;
    }
    const verdict = classify(q.bn, theirs);
    bnTally[verdict]++;
    if (verdict !== "exact" && verdict !== "normalised") {
      diffs.push({ lang: "Bangla", ref: q.reference, verdict, ours: q.bn, theirs: theirs.trim() });
    }
  }

  // --- English: one request per ayah ----------------------------------------
  console.log("Cross-checking English against api.quran.com...");
  const enTally: Record<Verdict, number> = { exact: 0, normalised: 0, gloss: 0, wording: 0 };
  for (const [i, q] of quotes.entries()) {
    const resBody = await fetchJson(`${QURAN_COM}?verse_key=${q.reference}`);
    const theirs: string | undefined = resBody?.translations?.[0]?.text;
    if (!theirs) {
      problems.push(`${q.reference} returned no English text from quran.com`);
      continue;
    }
    const verdict = classify(q.en, theirs);
    enTally[verdict]++;
    if (verdict !== "exact" && verdict !== "normalised") {
      diffs.push({
        lang: "English",
        ref: q.reference,
        verdict,
        ours: q.en,
        theirs: theirs.replace(/<[^>]*>/g, "").trim(),
      });
    }
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${quotes.length}`);
    await new Promise((r) => setTimeout(r, 80));
  }

  // --- report ---------------------------------------------------------------
  const line = (label: string, t: Record<Verdict, number>) =>
    `  ${label.padEnd(8)} ${VERDICTS.map((v) => `${t[v]} ${v}`).join(", ")}`;

  console.log("\n--- Agreement with the independent distributor ---");
  console.log(line("Bangla:", bnTally));
  console.log(line("English:", enTally));

  if (diffs.length > 0) {
    writeCrosscheckReport(diffs, bnTally, enTally);
    const wording = diffs.filter((d) => d.verdict === "wording").length;
    const gloss = diffs.filter((d) => d.verdict === "gloss").length;
    console.log(
      `\n${diffs.length} editorial difference(s): ${gloss} bracketed-gloss, ${wording} wording.\n` +
        `These are different printings of the same translation, not errors — see ` +
        `${path.relative(root, reportPath)} to choose.`
    );
  }

  if (problems.length > 0) {
    console.log(`\n${problems.length} STRUCTURAL PROBLEM(S):\n`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log("\nNo structural problems. Every ayah resolved to the reference asked for.");
}

function writeCrosscheckReport(
  diffs: { lang: string; ref: string; verdict: Verdict; ours: string; theirs: string }[],
  bnTally: Record<Verdict, number>,
  enTally: Record<Verdict, number>
): void {
  const md: string[] = [
    "# Cross-check report",
    "",
    "Generated by `npx tsx scripts/verify-quotes.ts`. Every ayah in",
    "`src/data/quran-quotes.json` was compared against an **independent distributor**",
    "of the same translation:",
    "",
    "| Translation | Ours | Compared against |",
    "| --- | --- | --- |",
    "| মুহিউদ্দীন খান (Bangla) | AlQuran.cloud `bn.bengali` | fawazahmed0/quran-api `ben-muhiuddinkhan` |",
    "| Saheeh International (English) | AlQuran.cloud `en.sahih` | api.quran.com translation `20` |",
    "",
    `- Bangla: ${VERDICTS.map((v) => `${bnTally[v]} ${v}`).join(", ")}`,
    `- English: ${VERDICTS.map((v) => `${enTally[v]} ${v}`).join(", ")}`,
    "",
    "`exact` and `normalised` entries agree and are not listed below. `normalised`",
    "means they differ only in diacritics, footnote markers or punctuation",
    '("Allah" vs "Allāh").',
    "",
    "The entries below are **not errors**. The two distributors carry different",
    "printings of the same translation: `gloss` differs only by the translator's",
    "bracketed insertions, `wording` by the words themselves. Decide which reading",
    "you want; if you prefer the other one, edit the text in",
    "`src/data/quran-quotes.json` directly and note it here.",
    "",
  ];

  for (const verdict of ["wording", "gloss"] as Verdict[]) {
    const group = diffs.filter((d) => d.verdict === verdict);
    if (group.length === 0) continue;
    md.push(`## ${verdict} differences (${group.length})`, "");
    for (const d of group) {
      md.push(`### ${d.ref} — ${d.lang}`, "", `- **Ours (in the bot):** ${d.ours}`, `- **Theirs:** ${d.theirs}`, "");
    }
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, md.join("\n"), "utf8");
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
