// Build order step 2: verify every seed handle before it ever reaches the
// agent. A dead handle wastes a tool call (and, in live mode, money) if it
// slips through — better to catch it here, once, up front.

import { readFileSync } from "node:fs";
import path from "node:path";
import { createScraperAdapter } from "../src/data/twitterapi.ts";

const seedsRaw = JSON.parse(
  readFileSync(path.join(process.cwd(), "config/seeds.json"), "utf-8")
) as Record<string, { handle: string; confidence: string }[]>;

async function main() {
  const adapter = createScraperAdapter();

  const alive: string[] = [];
  const dead: string[] = [];

  for (const [category, entries] of Object.entries(seedsRaw)) {
    for (const { handle, confidence } of entries) {
      const result = await adapter.resolveHandle(handle);
      if (result.exists) {
        alive.push(handle);
        console.log(`  ok    ${handle.padEnd(20)} (${category}, confidence: ${confidence})`);
      } else {
        dead.push(handle);
        console.log(`  DEAD  ${handle.padEnd(20)} (${category}, confidence: ${confidence})`);
      }
    }
  }

  console.log("");
  console.log(`${alive.length} alive, ${dead.length} dead.`);
  if (dead.length > 0) {
    console.log(`Remove these from config/seeds.json before the next live run: ${dead.join(", ")}`);
  }
}

main();
