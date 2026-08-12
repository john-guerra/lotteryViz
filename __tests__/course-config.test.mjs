import { resolveCourseConfig } from "../export-lottery-to-canvas.mjs";

describe("resolveCourseConfig", () => {
  const active = {
    webdev_summer_2026: { canvas: { courseId: 249954, lotteryAssignmentId: 3196231 } },
    lottery_tests: {},
  };
  const archive = {
    db_spring_2026: { canvasId: 111, lotteryAssignmentId: 222 },
  };

  test("prefers the active students.mjs canvas block", () => {
    expect(resolveCourseConfig("webdev_summer_2026", active, archive)).toEqual({
      courseId: 249954,
      lotteryAssignmentId: 3196231,
    });
  });

  test("falls back to the archived canvas-config entry", () => {
    expect(resolveCourseConfig("db_spring_2026", active, archive)).toEqual({
      courseId: 111,
      lotteryAssignmentId: 222,
    });
  });

  test("returns null for a course wired to neither", () => {
    expect(resolveCourseConfig("lottery_tests", active, archive)).toBeNull();
  });

  test("returns null for an unknown course", () => {
    expect(resolveCourseConfig("nope", active, archive)).toBeNull();
  });
});
