import type { Engagement } from "./types";
import { reachSets } from "./overlap";

/** How many NEW people each creator would add, given a set already chosen. */
export function marginalReach(edges: Engagement[], chosen: string[]): Record<string, number> {
  const sets = reachSets(edges);
  const covered = new Set<string>();
  for (const handle of chosen) {
    const set = sets.get(handle);
    if (set) for (const id of set) covered.add(id);
  }

  const out: Record<string, number> = {};
  for (const [handle, set] of sets) {
    let newCount = 0;
    for (const id of set) if (!covered.has(id)) newCount++;
    out[handle] = newCount;
  }
  return out;
}

export interface LineupStep {
  handle: string;
  addedReach: number;
  cumulativeReach: number;
  cumulativeCoveragePct: number;
}

/**
 * Greedy set cover: repeatedly add the creator with the largest marginal
 * new reach until `target` fraction of the total unique pool is covered.
 * This is the standard approximation algorithm for set cover -- not always
 * perfectly optimal, but fast and close, and deterministic here (ties break
 * alphabetically by handle).
 */
export function minimumLineup(edges: Engagement[], target: number): LineupStep[] {
  const sets = reachSets(edges);

  const total = new Set<string>();
  for (const set of sets.values()) for (const id of set) total.add(id);
  const targetCount = Math.ceil(target * total.size);

  const covered = new Set<string>();
  const remaining = new Set(sets.keys());
  const steps: LineupStep[] = [];

  while (covered.size < targetCount && remaining.size > 0) {
    let bestHandle: string | null = null;
    let bestNewCount = -1;

    for (const handle of [...remaining].sort()) {
      const set = sets.get(handle)!;
      let newCount = 0;
      for (const id of set) if (!covered.has(id)) newCount++;
      if (newCount > bestNewCount) {
        bestNewCount = newCount;
        bestHandle = handle;
      }
    }

    if (bestHandle === null || bestNewCount <= 0) break;

    for (const id of sets.get(bestHandle)!) covered.add(id);
    remaining.delete(bestHandle);
    steps.push({
      handle: bestHandle,
      addedReach: bestNewCount,
      cumulativeReach: covered.size,
      cumulativeCoveragePct: total.size === 0 ? 0 : covered.size / total.size,
    });
  }

  return steps;
}
