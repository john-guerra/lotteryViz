// This asserts, before any project's tests are collected, that both
// projects' `include` globs still match a sane number of files on disk.
// That closes real holes (files deleted, files moved off their declared
// path, a project's `include` glob broken, a project renamed or deleted
// from vitest.config.js outright).
//
// This used to be split across two checks: this globalSetup (for the case
// where a broken `include` glob makes a project match zero files, which
// Vitest reports as SUCCESS) plus a disk-scanning test file,
// __tests__/suite-coverage.test.mjs, run from inside the node project. That
// split was collapsed to just this file: the disk-scanning test file could
// itself go stale relative to `include` (move tests to a new directory and
// update `include` to match, and the disk scan fails while this check
// stays correct, since it re-runs the actual configured glob rather than a
// hardcoded directory list) and everything it could catch, this check
// already catches too. See git history for the removed file if the disk-scan
// approach is ever needed again.
//
// Vitest's `globalSetup` declared at the top level of vitest.config.js
// (sibling to `projects`, not inside either project) belongs to the root
// "core" project and runs once per `vitest run` invocation before any
// project's tests are collected -- Vitest always includes the root project
// in the set of projects it initializes global setup for, specifically so
// this can fire even when every other project matched nothing (see
// TestProject#_initializeGlobalSetup / Vitest#initializeGlobalSetup in
// vitest's own source).
//
// This doesn't re-implement glob matching by hand -- it asks each named
// project to run `globTestFiles()`, Vitest's own public API that
// re-executes THAT project's actual, currently configured `include`/`exclude`
// against disk (the same resolution Vitest itself uses to decide what to
// run). If someone breaks a project's `include` pattern, this call reflects
// that breakage directly, even though the files it should have matched are
// still untouched on disk -- which a filesystem scan of hardcoded
// directories structurally cannot detect.

// `yarn test --project node` / `--project jsdom` (required by the task
// interface) filter `vitest.projects` down to just the requested project
// BEFORE globalSetup runs -- the other project is simply absent, not
// "matched nothing". Only the projects actually present in this invocation
// are checked; a project's absence here means it was intentionally
// excluded by `--project`, not that its include pattern broke.
const PROJECT_FLOORS = [
  { name: "node", floor: 12 },
  { name: "jsdom", floor: 1 },
];

// Vitest globalSetup entry point. Receives the root TestProject; throwing
// aborts the whole `vitest run` with a nonzero exit code.
export default async function suiteCoverageGlobalSetup(rootProject) {
  const vitest = rootProject.vitest;
  // `vitest.config.project` is the list of names passed via `--project`; it's
  // `[]` when the flag wasn't used at all, and populated (e.g. `["node"]`)
  // when it was. That's how we tell "this project was filtered out by
  // --project" (expected, skip it) apart from "this project isn't in
  // vitest.config.js at all" (a rename or deletion slipped past every other
  // guard -- see the module comment above and the FIX 1 review finding).
  const filters = vitest.config.project;

  for (const { name, floor } of PROJECT_FLOORS) {
    const project = vitest.projects.find((p) => p.name === name);
    if (!project) {
      if (filters.length === 0) {
        // No --project flag was passed, so every project in the config
        // should have been initialized. Its absence means it was renamed
        // or deleted from vitest.config.js, not intentionally excluded.
        throw new Error(
          `suite-coverage globalSetup: project "${name}" is not in vitest.config.js at all -- was it renamed or deleted?`,
        );
      }
      continue; // genuinely filtered out by --project
    }

    const { testFiles } = await project.globTestFiles();

    if (testFiles.length < floor) {
      throw new Error(
        `suite-coverage globalSetup: ${name} project matches fewer than ${floor} test files (found ${testFiles.length}) -- check the include pattern in vitest.config.js`,
      );
    }
  }
}
