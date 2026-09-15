import path from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { openDb } from "../src/db/index.ts";
import { buildSnapshot, type CrawlStats, type ReportShape, type VisionStats } from "../src/export/snapshot.ts";

const REPORT_PATH = path.join(process.cwd(), ".data", "report.json");
if (!existsSync(REPORT_PATH)) {
  console.error("No .data/report.json found. Run `npm run crawl` first.");
  process.exit(1);
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

const db = openDb();
const report = JSON.parse(readFileSync(REPORT_PATH, "utf-8")) as ReportShape;
const crawlStats = readJsonIfExists<CrawlStats>(path.join(process.cwd(), ".data", "crawl-stats.json"));
const visionStats = readJsonIfExists<VisionStats>(path.join(process.cwd(), ".data", "vision-stats.json"));

const snapshot = buildSnapshot(db, report, crawlStats, visionStats);
db.close();

const PUBLIC_DIR = path.join(process.cwd(), "public");
if (!existsSync(PUBLIC_DIR)) mkdirSync(PUBLIC_DIR, { recursive: true });
writeFileSync(path.join(PUBLIC_DIR, "snapshot.json"), JSON.stringify(snapshot, null, 2));

console.log(`Wrote public/snapshot.json`);
console.log(`  ${snapshot.nodes.length} creators, ${snapshot.edges.length} edges (>=15% overlap)`);
console.log(`  ${snapshot.decisionLog.length} decision log entries`);
console.log(`  headline: "${snapshot.headline}"`);
