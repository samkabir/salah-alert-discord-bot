import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env";

fs.mkdirSync(path.dirname(env.DB_PATH), { recursive: true });

export const db = new Database(env.DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function runMigrations(): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL DEFAULT (datetime('now'))
     );`
  );

  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  const isApplied = db.prepare(`SELECT 1 FROM _migrations WHERE name = ?`);
  const markApplied = db.prepare(`INSERT INTO _migrations (name) VALUES (?)`);

  for (const file of files) {
    if (isApplied.get(file)) continue; // already run — skip (ALTERs are not idempotent)
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    db.exec(sql);
    markApplied.run(file);
  }
}

runMigrations();
