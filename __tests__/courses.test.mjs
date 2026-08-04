import { resolveCourseKey, buildCourseList } from "../front/src/courses.mjs";

describe("resolveCourseKey", () => {
  const available = ["webdev_summer_2026", "lottery_tests"];

  test("keeps a stored key that still exists", () => {
    expect(resolveCourseKey("lottery_tests", available)).toBe("lottery_tests");
  });

  test("falls back to the first course when the stored key is gone", () => {
    expect(resolveCourseKey("db_spring_2026", available)).toBe("webdev_summer_2026");
  });

  test("falls back to the first course when nothing is stored", () => {
    expect(resolveCourseKey(null, available)).toBe("webdev_summer_2026");
  });

  test("returns empty string when no courses exist", () => {
    expect(resolveCourseKey("anything", [])).toBe("");
  });
});

describe("buildCourseList", () => {
  const fixture = {
    webdev_summer_2026: { roster: [], canvas: { courseId: 1, lotteryAssignmentId: 2 } },
    lottery_tests: { roster: [] },
  };

  test("flags courses that have a canvas block", () => {
    expect(buildCourseList(fixture)).toEqual([
      { key: "webdev_summer_2026", hasCanvas: true },
      { key: "lottery_tests", hasCanvas: false },
    ]);
  });

  test("returns an empty list for no courses", () => {
    expect(buildCourseList({})).toEqual([]);
  });
});
