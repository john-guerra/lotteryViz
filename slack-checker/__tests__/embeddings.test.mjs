import { cosineSim, maxCosineToAny } from "../embeddings.mjs";

describe("cosineSim()", () => {
  test("identical vectors → 1", () => {
    expect(cosineSim([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
  });
  test("orthogonal vectors → 0", () => {
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  test("opposite vectors → -1", () => {
    expect(cosineSim([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });
  test("zero vector → 0 (no NaN)", () => {
    expect(cosineSim([0, 0], [1, 1])).toBe(0);
  });
});

describe("maxCosineToAny()", () => {
  test("returns the best similarity across references", () => {
    const vec = [1, 0];
    const refs = [[0, 1], [0.8, 0.2], [1, 0]];
    expect(maxCosineToAny(vec, refs)).toBeCloseTo(1, 6);
  });
  test("returns 0 when there are no references", () => {
    expect(maxCosineToAny([1, 0], [])).toBe(0);
  });
});
