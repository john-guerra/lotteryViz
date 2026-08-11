import { parseArgs } from "../export-lottery-to-canvas.mjs";

describe("parseArgs", () => {
  test("parses a single course", () => {
    expect(parseArgs(["--course", "lottery_tests"]).courses).toEqual(["lottery_tests"]);
  });

  test("parses short flags", () => {
    const options = parseArgs(["-c", "lottery_tests", "-d", "-v"]);
    expect(options).toMatchObject({ dryRun: true, verbose: true });
  });

  test("no longer returns a gradeType", () => {
    expect(parseArgs(["-c", "lottery_tests"]).gradeType).toBeUndefined();
  });

  test("rejects the removed --grade-type flag with an explanation", () => {
    expect(() => parseArgs(["--grade-type", "accumulated"])).toThrow(
      /--grade-type has been removed/
    );
  });

  test("rejects the short -g form too", () => {
    expect(() => parseArgs(["-g", "lottery"])).toThrow(/--grade-type has been removed/);
  });
});
