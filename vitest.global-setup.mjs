import path from "node:path";

// __tests__/suite-coverage.test.mjs asserts, from inside the node project,
// that both projects' `include` globs still match a sane number of files
// on disk. That closes real holes (files deleted, files moved off their
// declared path) -- but it cannot catch the one failure it exists for: if
// the node project's OWN `include` glob breaks, suite-coverage.test.mjs is
// excluded from the run right along with the 146 other node tests it's
// supposed to protect. Demonstrated directly in review: break the node
// project's `include` pattern, leave every file on disk untouched, run
// `yarn test` -- exit 0, "Test Files 1 passed (1)", "Tests 13 passed (13)"
// (the jsdom project alone), zero indication anything is missing.
//
// A second, independent check is needed that (a) is not itself gated by
// any project's `include` matching something, and (b) actually detects a
// broken `include` pattern rather than a disk scan that can't tell the
// difference between "config is fine" and "config is broken but the files
// happen to still be sitting where they always were".
//
// Vitest's `globalSetup` declared at the top level of vitest.config.js
// (sibling to `projects`, not inside either project) belongs to the root
// "core" project and runs once per `vitest run` invocation before any
// project's tests are collected -- Vitest always includes the root project
// in the set of projects it initializes global setup for, specifically so
// this can fire even when every other project matched nothing (see
// TestProject#_initializeGlobalSetup / Vitest#initializeGlobalSetup in
// vitest's own source). That solves (a).
//
// For (b), this doesn't re-implement glob matching by hand -- it asks each
// named project to run `globTestFiles()`, Vitest's own public API that
// re-executes THAT project's actual, currently configured `include`/`exclude`
// against disk (the same resolution Vitest itself uses to decide what to
// run). If someone breaks a project's `include` pattern, this call reflects
// that breakage directly, even though the files it should have matched are
// still untouched on disk -- which a filesystem scan of hardcoded
// directories structurally cannot detect.
const ROOT = import.meta.dirname;
const SUITE_COVERAGE_TEST_FILE = path.join(
  ROOT,
  "__tests__",
  "suite-coverage.test.mjs",
);

// `yarn test --project node` / `--project jsdom` (required by the task
// interface) filter `vitest.projects` down to just the requested project
// BEFORE globalSetup runs -- the other project is simply absent, not
// "matched nothing". Only the projects actually present in this invocation
// are checked; a project's absence here means it was intentionally
// excluded by `--project`, not that its include pattern broke.
const PROJECT_FLOORS = [
  // excludes suite-coverage.test.mjs itself, see filterSelf below
  { name: "node", floor: 12, filterSelf: true },
  { name: "jsdom", floor: 1, filterSelf: false },
];

function filterSelf(filePath) {
  return path.resolve(filePath) !== SUITE_COVERAGE_TEST_FILE;
}

// Vitest globalSetup entry point. Receives the root TestProject; throwing
// aborts the whole `vitest run` with a nonzero exit code.
export default async function suiteCoverageGlobalSetup(rootProject) {
  const vitest = rootProject.vitest;

  for (const { name, floor, filterSelf: excludeSelf } of PROJECT_FLOORS) {
    const project = vitest.projects.find((p) => p.name === name);
    if (!project) continue; // not part of this invocation (e.g. `--project` filtered it out)

    const { testFiles } = await project.globTestFiles();
    const files = excludeSelf ? testFiles.filter(filterSelf) : testFiles;

    if (files.length < floor) {
      throw new Error(
        `suite-coverage globalSetup: ${name} project matches fewer than ${floor} test files (found ${files.length}) -- check the include pattern in vitest.config.js`,
      );
    }
  }
}
