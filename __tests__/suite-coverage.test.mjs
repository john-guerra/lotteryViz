import fs from "node:fs";
import path from "node:path";

// A Vitest project whose `include` glob stops matching any file reports
// SUCCESS -- not failure -- with zero tests run. This was demonstrated
// directly during review: appending ".broken" to the node project's
// `include` pattern in vitest.config.js and running `yarn test` produced
// exit code 0, "Test Files 1 passed (1)", "Tests 13 passed (13)" -- the
// jsdom project's output alone -- while all 144 node tests silently
// stopped running. Nothing about that green run distinguishes it from a
// legitimately smaller suite; a human has to remember "157" is the number
// to expect and notice when it quietly isn't.
//
// This guard walks the filesystem directly for the same directories the
// two vitest.config.js projects declare in `include` -- deliberately NOT
// parsing vitest.config.js itself, so the guard also catches the config
// drifting away from where the test files actually live, not just the
// files disappearing.
const ROOT = path.join(import.meta.dirname, "..");
const SELF = import.meta.filename ?? import.meta.dirname + "/suite-coverage.test.mjs";

function findTestFiles(relDir, extensions) {
  const absDir = path.join(ROOT, relDir);
  if (!fs.existsSync(absDir)) return [];
  return fs
    .readdirSync(absDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name))
    .filter((filePath) => extensions.some((ext) => filePath.endsWith(ext)))
    .filter((filePath) => filePath !== SELF); // don't let this guard pad its own count
}

describe("suite coverage guard", () => {
  test("jsdom project (front/src/**/*.test.{js,jsx}) matches at least 1 test file", () => {
    const files = findTestFiles("front/src", [".test.js", ".test.jsx"]);
    expect(
      files.length,
      "jsdom project matches no test files -- check the include pattern in vitest.config.js",
    ).toBeGreaterThanOrEqual(1);
  });

  test("node project (__tests__ + slack-checker/__tests__) matches at least 12 test files", () => {
    const files = [
      ...findTestFiles("__tests__", [".test.mjs"]),
      ...findTestFiles("slack-checker/__tests__", [".test.mjs"]),
    ];
    expect(
      files.length,
      "node project matches fewer than 12 test files -- check the include pattern in vitest.config.js",
    ).toBeGreaterThanOrEqual(12);
  });
});
