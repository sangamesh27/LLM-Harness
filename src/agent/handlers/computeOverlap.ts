import type Database from "better-sqlite3";
import { overlapMatrix } from "../../analysis/overlap";
import { marginalReach } from "../../analysis/setcover";
import { loadEngagements } from "./_shared";

export interface ComputeOverlapInput {
  creator_handles: string[];
}

export interface ComputeOverlapResult {
  overlapMatrix: Record<string, Record<string, number>>;
  // No "already chosen" set exists at this call site (the tool schema has no
  // such param) -- this is each creator's total real-signal reach, not a
  // marginal-over-a-baseline number.
  uniqueReach: Record<string, number>;
}

export function computeOverlap(db: Database.Database, input: ComputeOverlapInput): ComputeOverlapResult {
  const edges = loadEngagements(db, input.creator_handles);
  return {
    overlapMatrix: overlapMatrix(edges),
    uniqueReach: marginalReach(edges, []),
  };
}
