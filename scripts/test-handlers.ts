// Manually drives the tool handlers in the order the agent will eventually
// choose for itself. No LLM involved yet -- this is step 4's checkpoint:
// prove every handler works, independent of the agent loop that calls them.
//
// This writes real data into .data/crawl.db. Delete that file and re-run
// `npm run db:init` if you want a clean slate afterward.

import { existsSync } from "node:fs";
import path from "node:path";
import { openDb } from "../src/db/index.ts";
import { createScraperAdapter } from "../src/data/twitterapi.ts";
import {
  fetchCreatorPosts,
  fetchPostEngagers,
  computeOverlap,
  suggestAdjacentCreators,
  solveMinimumSet,
  emitReport,
} from "../src/agent/handlers/index.ts";

const DB_PATH = path.join(process.cwd(), ".data", "crawl.db");
if (!existsSync(DB_PATH)) {
  console.error("No .data/crawl.db found. Run `npm run db:init` first.");
  process.exit(1);
}

const db = openDb();
const adapter = createScraperAdapter();

const HANDLES = [
  "thejustinwelsh",
  "davegerhardt", // gtm_marketing
  "jasonlk",
  "iannarino", // sales
  "lennysan",
  "gregisenberg", // product_growth
  "swyx",
  "rauchg", // devtools
];

async function main() {
  console.log(`=== fetch_creator_posts x${HANDLES.length} ===`);
  const allPostIds: string[] = [];
  for (const handle of HANDLES) {
    const result = await fetchCreatorPosts(db, adapter, { handle, platform: "x", limit: 12 });
    if (result.error) {
      console.log(`  ${handle.padEnd(18)} ERROR: ${result.error}`);
      continue;
    }
    allPostIds.push(...result.posts.map((p) => p.id));
    console.log(`  ${handle.padEnd(18)} ${result.postsReturned} posts (cacheHit=${result.cacheHit})`);
  }

  console.log(`\n=== fetch_post_engagers (batched, ${allPostIds.length} posts) ===`);
  const engagersResult = await fetchPostEngagers(db, adapter, { post_ids: allPostIds, platform: "x" });
  console.log(`  wrote ${engagersResult.engagersWritten} engagement rows`);
  console.log(`  cacheHit=${engagersResult.cacheHit}, partial posts: ${engagersResult.partialPosts.length}`);

  console.log(`\n=== compute_overlap ===`);
  const overlap = computeOverlap(db, { creator_handles: HANDLES });
  console.log("  lennysan <-> gregisenberg:", overlap.overlapMatrix.lennysan?.gregisenberg?.toFixed(2));
  console.log("  lennysan <-> swyx:        ", overlap.overlapMatrix.lennysan?.swyx?.toFixed(2));
  console.log("  uniqueReach:", overlap.uniqueReach);

  console.log(`\n=== suggest_adjacent_creators (min_appearances=2) ===`);
  const suggestions = suggestAdjacentCreators(db, { min_appearances: 2, max_results: 5 });
  for (const c of suggestions.candidates) {
    console.log(`  ${c.handle.padEnd(18)} appears on ${c.appearances} creators' posts, ${c.followerCount} followers`);
  }
  if (suggestions.candidates.length === 0) console.log("  (none found)");

  console.log(`\n=== solve_minimum_set (target_coverage=0.8) ===`);
  const lineup = solveMinimumSet(db, { target_coverage: 0.8 });
  for (const step of lineup.lineup) {
    console.log(
      `  + ${step.handle.padEnd(18)} adds ${step.addedReach.toString().padStart(3)} new  (${(step.cumulativeCoveragePct * 100).toFixed(1)}% covered)`
    );
  }

  console.log(`\n=== emit_report ===`);
  const top = lineup.lineup[0];
  const good = emitReport({
    headline_insight: `These ${lineup.lineup.length} creators, led by ${top.handle}, cover ${(lineup.lineup[lineup.lineup.length - 1].cumulativeCoveragePct * 100).toFixed(0)}% of the combined engaged audience.`,
    recommended_lineup: lineup.lineup.map((s) => ({
      handle: s.handle,
      unique_reach: s.cumulativeReach,
      marginal_gain_pct: s.cumulativeCoveragePct * 100,
    })),
    redundant_pairs: [],
  });
  console.log("  valid report accepted:", good.accepted);

  const bad = emitReport({
    headline_insight: "There is significant overlap among B2B creators.",
    recommended_lineup: lineup.lineup.map((s) => ({ handle: s.handle, unique_reach: s.cumulativeReach, marginal_gain_pct: 0 })),
    redundant_pairs: [],
  });
  console.log("  vague report accepted:", bad.accepted, `(reason: ${bad.reason})`);
}

main().finally(() => db.close());
