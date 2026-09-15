import type { Engagement } from "./types";

// Retweets are noisy and cheap to fake (BUILD.md, Budget and cost control).
// Only replies and quotes count as real "reach" for overlap purposes.
const SIGNAL_TYPES = new Set(["reply", "quote"]);

/** creatorHandle -> the set of distinct people who reached them with signal. */
export function reachSets(edges: Engagement[]): Map<string, Set<string>> {
  const sets = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!SIGNAL_TYPES.has(edge.engagementType)) continue;
    if (!sets.has(edge.creatorHandle)) sets.set(edge.creatorHandle, new Set());
    sets.get(edge.creatorHandle)!.add(edge.engagerUserId);
  }
  return sets;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Jaccard overlap between every creator pair currently in the pool. */
export function overlapMatrix(edges: Engagement[]): Record<string, Record<string, number>> {
  const sets = reachSets(edges);
  const handles = [...sets.keys()];
  const matrix: Record<string, Record<string, number>> = {};
  for (const a of handles) {
    matrix[a] = {};
    for (const b of handles) {
      matrix[a][b] = a === b ? 1 : jaccard(sets.get(a)!, sets.get(b)!);
    }
  }
  return matrix;
}
