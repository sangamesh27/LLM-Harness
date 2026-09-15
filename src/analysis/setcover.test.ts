import { describe, it, expect } from "vitest";
import { marginalReach, minimumLineup } from "./setcover";
import { HANDBUILT_5 } from "./__fixtures__/handbuilt5";

describe("marginalReach", () => {
  it("with nothing chosen, marginal reach equals each creator's total reach", () => {
    const result = marginalReach(HANDBUILT_5, []);
    expect(result.A).toBe(10);
    expect(result.B).toBe(10);
    expect(result.C).toBe(11);
    expect(result.D).toBe(11);
    expect(result.E).toBe(5);
  });

  it("once A is chosen, B only adds its non-overlapping 5, E adds zero", () => {
    const result = marginalReach(HANDBUILT_5, ["A"]);
    expect(result.B).toBe(5);
    expect(result.E).toBe(0);
    expect(result.C).toBe(11); // untouched by A
    expect(result.A).toBe(0); // already chosen, nothing new left
  });
});

describe("minimumLineup", () => {
  it("greedily picks C, then A, then B to hit 80% coverage, skipping redundant D and E", () => {
    const steps = minimumLineup(HANDBUILT_5, 0.8);
    expect(steps.map((s) => s.handle)).toEqual(["C", "A", "B"]);
    expect(steps[0]).toMatchObject({ addedReach: 11, cumulativeReach: 11 });
    expect(steps[1]).toMatchObject({ addedReach: 10, cumulativeReach: 21 });
    expect(steps[2]).toMatchObject({ addedReach: 5, cumulativeReach: 26 });
    expect(steps[2].cumulativeCoveragePct).toBeCloseTo(26 / 31, 10);
  });

  it("never needs D or E to hit 80%, proving they're redundant", () => {
    const handles = minimumLineup(HANDBUILT_5, 0.8).map((s) => s.handle);
    expect(handles).not.toContain("D");
    expect(handles).not.toContain("E");
  });

  it("covers the full pool when target is 1.0, adding D but never E", () => {
    const steps = minimumLineup(HANDBUILT_5, 1.0);
    expect(steps.map((s) => s.handle)).toEqual(["C", "A", "B", "D"]);
    expect(steps[steps.length - 1].cumulativeReach).toBe(31);
  });
});
