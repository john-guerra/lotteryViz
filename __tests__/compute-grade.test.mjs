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
    // 8 of the other 10 points are below 16 -> percentile 80 -> grade 106 exactly.
    expect(computeGrade(16, POINTS, stats)).toBe(106);
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

  test("a student at the raw median scores above 100 once a median adjustment shifts the distribution", () => {
    // Mirrors export-lottery-to-canvas.mjs:656-689: the whole distribution is shifted
    // by medianAdjustment before grading (allPointsSorted.map(p => p - medianAdjustment)),
    // but each student is graded on their RAW points against that shifted distribution.
    // A student sitting at the raw (unadjusted) median therefore lands above the
    // adjusted median and must score above 100.
    const medianAdjustment = 2;
    const adjustedPointsSorted = POINTS.map((p) => p - medianAdjustment);
    const adjustedStats = statsFor(adjustedPointsSorted);

    const grade = computeGrade(MEDIAN, adjustedPointsSorted, adjustedStats);

    expect(grade).toBeGreaterThan(100);
    expect(grade).toBe(102);
  });
});
