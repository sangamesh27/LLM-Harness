import path from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { openDb } from "../src/db/index.ts";
import { createScraperAdapter } from "../src/data/twitterapi.ts";
import { runAgentLoop } from "../src/agent/loop.ts";
import { loadDotEnv } from "../src/util/env.ts";

loadDotEnv(path.join(process.cwd(), ".env"));

const DB_PATH = path.join(process.cwd(), ".data", "crawl.db");
if (!existsSync(DB_PATH)) {
  console.error("No .data/crawl.db found. Run `npm run db:init` first.");
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set.");
  console.error("Copy .env.example to .env and add your key, then re-run `npm run crawl`.");
  process.exit(1);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  const seedsRaw = JSON.parse(
    readFileSync(path.join(process.cwd(), "config/seeds.json"), "utf-8")
  ) as Record<string, { handle: string; confidence: string }[]>;

  const db = openDb();
  const adapter = createScraperAdapter();

  // Pre-register seed creators with their real cluster_hint. The agent
  // never sees this column -- it exists purely so we can check afterward
  // whether the agent rediscovered our groupings on its own.
  const now = new Date().toISOString();
  const insertSeed = db.prepare(
    `INSERT INTO creators (handle, cluster_hint, added_by, added_at)
     VALUES (@handle, @clusterHint, 'seed', @now)
     ON CONFLICT(handle) DO NOTHING`
  );
  const allHandles: string[] = [];
  for (const [category, entries] of Object.entries(seedsRaw)) {
    for (const { handle } of entries) {
      insertSeed.run({ handle, clusterHint: category, now });
      allHandles.push(handle);
    }
  }

  // Flat and shuffled -- no category labels reach the agent.
  const seedHandles = shuffle(allHandles);
  console.log(
    `Starting crawl with ${seedHandles.length} seed creators (SCRAPER=${process.env.SCRAPER ?? "fixtures"}).\n`
  );

  try {
    const result = await runAgentLoop(db, adapter, seedHandles);

    console.log("\n=== Crawl finished ===");
    console.log(`Tool calls used: ${result.toolCallsUsed} / 120 (+ ${result.cacheHits} cache hits, free)`);
    console.log(
      `Cache tokens -- written: ${result.cacheCreationTokens}, read: ${result.cacheReadTokens} (reads cost ~10% of normal price)`
    );
    console.log(`Estimated cost: $${result.estimatedCostUsd.toFixed(4)}`);

    writeFileSync(
      path.join(process.cwd(), ".data", "crawl-stats.json"),
      JSON.stringify(
        {
          toolCallsUsed: result.toolCallsUsed,
          cacheHits: result.cacheHits,
          cacheReadTokens: result.cacheReadTokens,
          cacheCreationTokens: result.cacheCreationTokens,
          estimatedCostUsd: result.estimatedCostUsd,
          finishedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    if (result.report) {
      console.log(`\nReport written to .data/report.json`);
      console.log(JSON.stringify(result.report, null, 2));
    } else {
      console.log("\nNo report was emitted -- budget ran out or the agent stopped early.");
      console.log("Check the agent_log table in .data/crawl.db to see why.");
    }
  } finally {
    db.close();
  }
}

main();
