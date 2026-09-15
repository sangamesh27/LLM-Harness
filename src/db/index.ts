import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), ".data", "crawl.db");
const SCHEMA_PATH = path.join(process.cwd(), "src", "db", "schema.sql");

export function openDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function initSchema(db: Database.Database): void {
  const schema = readFileSync(SCHEMA_PATH, "utf-8");
  db.exec(schema);
}
