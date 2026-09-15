import { existsSync } from "node:fs";
import path from "node:path";
import { openDb, initSchema } from "../src/db/index.ts";

const DB_PATH = path.join(process.cwd(), ".data", "crawl.db");

if (existsSync(DB_PATH)) {
  console.log(`Already initialized: ${DB_PATH}`);
  console.log("Delete that file first if you want a clean schema.");
  process.exit(0);
}

const db = openDb();
initSchema(db);
db.close();

console.log(`Created ${DB_PATH} with the crawl schema.`);
