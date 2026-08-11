import { computeGrade } from "../export-lottery-to-canvas.mjs";

// A fixed distribution so the curve is pinned to exact numbers.
// 11 values, so the upper-middle element (index 5) is the median: 10.
const POINTS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
const MEDIAN = POINTS[Math.floor(POINTS.length / 2)];

function statsFor(points) {
  const mean = points.reduce((a, b) => a + b, 0) / points.length;
  const variance =
    points.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / points.length;
  return {
    median: points[Math.floor(points.length / 2)],
    stdDev: Math.sqrt(variance),
  };
}

describe("computeGrade", () => {
  const stats = statsFor(POINTS);

  test("a student exactly at the median gets 100", () => {
    expect(computeGrade(MEDIAN, POINTS, stats)).toBe(100);
  });

  test("the top student gets 110", () => {
    expect(computeGrade(20, POINTS, stats)).toBe(110);
  });

  test("above the median rises linearly toward 110", () => {
    const grade = computeGrade(16, POINTS, stats);
    expect(grade).toBeGreaterThan(100);
    expect(grade).toBeLessThan(110);
  });

  test("one standard deviation below the median lands near 78", () => {
    const oneSdBelow = stats.median - stats.stdDev;
    expect(computeGrade(oneSdBelow, POINTS, stats)).toBeCloseTo(77.78, 1);
  });

  test("three standard deviations below the median lands at -100", () => {
    const threeSdBelow = stats.median - 3 * stats.stdDev;
    expect(computeGrade(threeSdBelow, POINTS, stats)).toBe(-100);
  });

  test("the penalty floors at -100 rather than going lower", () => {
    expect(computeGrade(-1000, POINTS, stats)).toBe(-100);
  });

  test("a single-student class gets the median grade", () => {
    expect(computeGrade(5, [5], { median: 5, stdDev: 0 })).toBe(100);
  });

  test("uses the upper-middle element as median, not the average of two", () => {
    // Even-length: d3.median would say 5, this code says 6 (index 2).
    const even = [2, 4, 6, 8];
    const evenStats = statsFor(even);
    expect(evenStats.median).toBe(6);
    expect(computeGrade(6, even, evenStats)).toBe(100);
  });
});
