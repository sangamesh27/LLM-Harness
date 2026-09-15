import type Database from "better-sqlite3";
import type { ScraperAdapter } from "../../data/twitterapi";
import { fetchCreatorPosts, type FetchCreatorPostsInput } from "./fetchCreatorPosts";
import { fetchPostEngagers, type FetchPostEngagersInput } from "./fetchPostEngagers";
import { computeOverlap, type ComputeOverlapInput } from "./computeOverlap";
import { suggestAdjacentCreators, type SuggestAdjacentCreatorsInput } from "./suggestAdjacentCreators";
import { solveMinimumSet, type SolveMinimumSetInput } from "./solveMinimumSet";
import { emitReport, type EmitReportInput } from "./emitReport";

export {
  fetchCreatorPosts,
  fetchPostEngagers,
  computeOverlap,
  suggestAdjacentCreators,
  solveMinimumSet,
  emitReport,
};

/**
 * Dispatches a tool call by name. `classify_hook_style` is deliberately not
 * here -- the vision pass runs as its own phase after the crawl (BUILD.md
 * step 7), not inside this loop.
 */
export function createToolRunner(db: Database.Database, adapter: ScraperAdapter) {
  return async function runTool(name: string, input: unknown): Promise<unknown> {
    switch (name) {
      case "fetch_creator_posts":
        return fetchCreatorPosts(db, adapter, input as FetchCreatorPostsInput);
      case "fetch_post_engagers":
        return fetchPostEngagers(db, adapter, input as FetchPostEngagersInput);
      case "compute_overlap":
        return computeOverlap(db, input as ComputeOverlapInput);
      case "suggest_adjacent_creators":
        return suggestAdjacentCreators(db, input as SuggestAdjacentCreatorsInput);
      case "solve_minimum_set":
        return solveMinimumSet(db, input as SolveMinimumSetInput);
      case "emit_report":
        return emitReport(input as EmitReportInput);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  };
}
