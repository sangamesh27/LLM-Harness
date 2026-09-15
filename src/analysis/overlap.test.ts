import { describe, it, expect } from "vitest";
import { overlapMatrix } from "./overlap";
import { HANDBUILT_5 } from "./__fixtures__/handbuilt5";

describe("overlapMatrix", () => {
  const matrix = overlapMatrix(HANDBUILT_5);

  it("gives every creator 100% overlap with itself", () => {
    for (const h of ["A", "B", "C", "D", "E"]) {
      expect(matrix[h][h]).toBe(1);
    }
  });

  it("computes A/B overlap as 5 shared out of 15 total union", () => {
    expect(matrix.A.B).toBeCloseTo(5 / 15, 10);
    expect(matrix.B.A).toBeCloseTo(5 / 15, 10);
  });

  it("computes C/D overlap as 6 shared out of 16 total union", () => {
    expect(matrix.C.D).toBeCloseTo(6 / 16, 10);
  });

  it("finds zero overlap between fully disjoint clusters", () => {
    expect(matrix.A.C).toBe(0);
    expect(matrix.B.D).toBe(0);
  });

  it("finds E is exactly half of A (5 of A's 10 people)", () => {
    expect(matrix.A.E).toBeCloseTo(5 / 10, 10);
  });

  it("finds E has zero overlap with B (E is 1-5, B is 6-15)", () => {
    expect(matrix.E.B).toBe(0);
  });
});
