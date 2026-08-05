// Copy non-TS runtime assets that `tsc` does not emit into dist/.
// Run automatically as part of `npm run build`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const assets = [
  ["src/db/migrations", "dist/db/migrations"],
  ["src/data", "dist/data"],
];

for (const [from, to] of assets) {
  const src = path.join(root, from);
  const dest = path.join(root, to);
  if (!fs.existsSync(src)) {
    console.warn(`[copy-assets] skip (missing): ${from}`);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[copy-assets] ${from} -> ${to}`);
}
