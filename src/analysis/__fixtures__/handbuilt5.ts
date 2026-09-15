import type { Engagement } from "../types";

// A hand-built fixture with a known correct answer, per BUILD.md:
// "Test each with a hand-built 5-creator fixture where you know the answer."
//
//   A: engagers 1-10
//   B: engagers 6-15   (shares 6-10 with A -- 5 people)
//   C: engagers 20-30  (fully disjoint from A/B)
//   D: engagers 25-35  (shares 25-30 with C -- 6 people)
//   E: engagers 1-5    (fully contained inside A -- totally redundant)
//
// Total unique pool across all five: {1..15} u {20..35} = 15 + 16 = 31 people.

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function repliesFor(handle: string, ids: number[]): Engagement[] {
  return ids.map((id) => ({
    engagerUserId: `p${id}`,
    creatorHandle: handle,
    engagementType: "reply" as const,
  }));
}

export const HANDBUILT_5: Engagement[] = [
  ...repliesFor("A", range(1, 10)),
  ...repliesFor("B", range(6, 15)),
  ...repliesFor("C", range(20, 30)),
  ...repliesFor("D", range(25, 35)),
  ...repliesFor("E", range(1, 5)),
];
