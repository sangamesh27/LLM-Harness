import type Database from "better-sqlite3";
import { minimumLineup, type LineupStep } from "../../analysis/setcover";
import { loadEngagements } from "./_shared";

export interface SolveMinimumSetInput {
  target_coverage?: number;
}

export interface SolveMinimumSetResult {
  lineup: LineupStep[];
}

export function solveMinimumSet(db: Database.Database, input: SolveMinimumSetInput): SolveMinimumSetResult {
  const target = input.target_coverage ?? 0.8;
  const edges = loadEngagements(db);
  return { lineup: minimumLineup(edges, target) };
}
