# Canvas Grade Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the illusory Canvas grade-type selector, then add a Grade column to the Admin student table showing the exact grade Canvas will receive.

**Architecture:** Phase 1 is pure deletion — `gradeType` only ever picked the destination assignment, never the submitted value, so removing it changes no behavior beyond removing a broken option. Phase 2 extracts the export job's start-and-poll transport into a shared module, fixes a latent 404-as-success bug during that extraction, and feeds the dry-run result into a new table column.

**Tech Stack:** Node ESM, Express, React 18 (create-react-app 5), d3, Jest (two runners — see Global Constraints), Bootstrap 4 classes.

**Spec:** `docs/superpowers/specs/2026-08-11-admin-canvas-grade-column-design.md`

## Global Constraints

- **Two Jest runners, do not confuse them.** Root `yarn test` is `testEnvironment: 'node'`, `transform: {}`, `testMatch: ['**/__tests__/**/*.mjs', '**/*.test.mjs']` — it runs **`.mjs` only, with no JSX transform**. React component tests run under create-react-app's Jest via `cd front && CI=true yarn test`. A React test placed in root `__tests__/` will not run; a `.mjs` node test placed in `front/src/` will not run either.
- Root tests may import from `front/src/*.mjs` — `__tests__/courses.test.mjs` already does this.
- **Baseline before starting: 9 suites, 121 tests, all passing.** Every task must leave it green.
- `front/src` must not import files outside `front/src` — CRA's `ModuleScopePlugin` blocks it at build time.
- New React components/props require `propTypes` (project convention).
- Frontend verification is `cd front && yarn build`, then test against the backend at `http://localhost:4001` — not the CRA dev server (see `CLAUDE.md`).
- `front/src/students.mjs`, `canvas-config.json`, and `canvas-export-log.txt` are **untracked and private**. Never paste Canvas IDs, course keys, or student names into commits, tests, or fixtures.
- Do not touch `computeGrade`'s arithmetic, the stats block (`:656-689`), or the comment template (`:866-872`). Phase 1 restructures around them, not through them.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `export-lottery-to-canvas.mjs` | Modify | Drop `gradeType`; export `computeGrade` and `parseArgs` for testing |
| `__tests__/compute-grade.test.mjs` | Create | Golden test pinning the grading curve |
| `__tests__/parse-args.test.mjs` | Create | CLI flag rejection |
| `routes/canvas.js` | Modify | Drop `gradeType` from body and dedupe key |
| `front/src/canvasExportJob.mjs` | Create | Start-and-poll transport for export jobs; the only place polling and HTTP error handling live |
| `__tests__/canvas-export-job.test.mjs` | Create | Transport tests, including the 404 regression |
| `front/src/components/CanvasExportModal.js` | Modify | Drop `gradeType`; consume the shared transport |
| `front/src/components/StudentTable.js` | Modify | Render, tint, and sort the Grade column |
| `front/src/components/StudentTable.test.js` | Create | Column render states and sort ordering (CRA Jest) |
| `front/src/pages/AdminPage.js` | Modify | Remove the selector; own grade-loading state and the Load button |

---

# Phase 1 — Delete the grade-type selector

### Task 1: Pin the grading curve with a golden test

Nothing currently pins `computeGrade`'s arithmetic. Phase 1 restructures the code around it, so the safety net comes first.

**Files:**
- Modify: `export-lottery-to-canvas.mjs:1056`
- Test: `__tests__/compute-grade.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: `computeGrade(studentPoints, allPointsSorted, stats)` exported from `export-lottery-to-canvas.mjs`, where `stats` is `{ median: number, stdDev: number }`

- [ ] **Step 1: Write the failing test**

Create `__tests__/compute-grade.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test __tests__/compute-grade.test.mjs`
Expected: FAIL — `computeGrade is not a function` (it is defined but not exported).

- [ ] **Step 3: Export the function**

In `export-lottery-to-canvas.mjs:1056`, add `computeGrade` to the export list:

```js
// Exports for testing
export { MIN_CONFIDENCE, parseNameParts, scoreNameMatch, matchLotteryToCanvas, processCourse, computeGrade };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test __tests__/compute-grade.test.mjs`
Expected: PASS, 8 tests.

If the 1-SD case is off, do **not** change `computeGrade`. Read the actual value from the failure and adjust the expectation — the point is to pin current behavior, not to assert what the docstring claims.

- [ ] **Step 5: Run the full suite**

Run: `yarn test`
Expected: 10 suites, 129 tests, all passing.

- [ ] **Step 6: Commit**

```bash
git add __tests__/compute-grade.test.mjs export-lottery-to-canvas.mjs
git commit -m "test: pin the lottery grading curve before restructuring"
```

---

### Task 2: Remove gradeType from the export script

**Files:**
- Modify: `export-lottery-to-canvas.mjs` — `:530`, `:553`, `:559-562`, `:804`, `:826`, `:942-990`, `:1024`, `:1050-1053`, `:1056`
- Test: `__tests__/parse-args.test.mjs`

**Interfaces:**
- Consumes: `computeGrade` export from Task 1
- Produces: `parseArgs(argv)` exported, taking an array of arguments and returning `{ courses, dryRun, all, verbose }`. `processCourse(courseName, { dryRun, verbose })` — the `gradeType` option no longer exists.

- [ ] **Step 1: Write the failing test**

Create `__tests__/parse-args.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test __tests__/parse-args.test.mjs`
Expected: FAIL — `parseArgs is not a function`.

- [ ] **Step 3: Rewrite parseArgs**

Replace the whole `parseArgs` function (`:942-990`) with:

```js
function parseArgs(argv = process.argv.slice(2)) {
  const args = argv;
  const options = {
    courses: [],
    dryRun: false,
    all: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--course" || arg === "-c") {
      options.courses.push(args[++i]);
    } else if (arg === "--dry-run" || arg === "-d") {
      options.dryRun = true;
    } else if (arg === "--all" || arg === "-a") {
      options.all = true;
    } else if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
    } else if (arg === "--grade-type" || arg === "-g") {
      // Removed deliberately: this flag only ever chose the destination
      // assignment, never the submitted value, so "accumulated" posted the
      // curved grade to a column named for a raw tally. Fail loudly rather
      // than silently ignoring a flag someone's muscle memory still types.
      throw new Error(
        "--grade-type has been removed. Exports always submit the lottery grade; " +
          "the raw point total and class median are in the Canvas comment."
      );
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: node export-lottery-to-canvas.mjs [options]

Options:
  --course, -c <name>    Course to process (can be specified multiple times)
  --all, -a              Process all courses
  --dry-run, -d          Preview grades without submitting to Canvas
  --verbose, -v          Show detailed output for each submission
  --help, -h             Show this help message

Examples:
  npm run export_to_canvas -- --course my_course --dry-run
  npm run export_to_canvas -- --all
  npm run export_to_canvas -- -c my_course -v
`);
      process.exit(0);
    }
  }

  if (options.all) {
    options.courses = Object.keys(config.courses);
  }

  return options;
}
```

- [ ] **Step 4: Export parseArgs and guard main()**

At `:1056`, add `parseArgs` to the export list:

```js
export { MIN_CONFIDENCE, parseNameParts, scoreNameMatch, matchLotteryToCanvas, processCourse, computeGrade, parseArgs };
```

`parseArgs` now throws, and it is called inside async `main()`, so the throw becomes a rejected promise. Replace the bare call at `:1050-1053`:

```js
// Run CLI only when executed directly, not when imported for testing
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn test __tests__/parse-args.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 6: Remove gradeType from processCourse**

Four edits inside `processCourse`.

`:530` — drop the option:

```js
  const { dryRun = false, verbose = false } = options;
```

`:553` — stop destructuring the accumulated ID:

```js
  const {
    courseId: canvasId,
    lotteryAssignmentId,
    participationGroupId,
  } = courseConfig;
```

`:559-562` — collapse the branch. Replace the `let assignmentId; if (gradeType === "lottery") {...} else if (...) {...}` block with:

```js
  let assignmentId = lotteryAssignmentId;
```

`:804` — the auto-create name is now fixed:

```js
      assignmentName = "Lottery Grade";
```

`:826` — the config hint no longer branches:

```js
          console.log(
            `  Update canvas-config.json with: "lotteryAssignmentId": ${assignmentId}`
          );
```

- [ ] **Step 7: Verify no gradeType references remain**

Run: `grep -n "gradeType" export-lottery-to-canvas.mjs`
Expected: no output.

- [ ] **Step 8: Run the full suite**

Run: `yarn test`
Expected: 11 suites, 134 tests, all passing. The golden test from Task 1 is what proves the grading curve survived this edit.

- [ ] **Step 9: Verify the CLI still runs**

Run: `yarn export-to-canvas --help`
Expected: usage text with no `--grade-type` line, exit 0.

Run: `yarn export-to-canvas -c lottery_tests -g lottery`
Expected: `Error: --grade-type has been removed. …` and exit code 1.

- [ ] **Step 10: Commit**

```bash
git add export-lottery-to-canvas.mjs __tests__/parse-args.test.mjs
git commit -m "refactor(canvas): remove the grade-type option from the export script

gradeType only ever selected the destination assignment, never the
submitted value, so --grade-type accumulated posted the curved grade to
a column named for a raw tally. The raw total and class median are
already in the Canvas comment, so the second assignment carried nothing
the comment lacked."
```

---

### Task 3: Remove gradeType from the export API

**Files:**
- Modify: `routes/canvas.js:23`, `:42-47`

**Interfaces:**
- Consumes: `processCourse(course, { dryRun, verbose })` from Task 2
- Produces: `POST /api/canvas/export` accepting `{ course, dryRun }`; job dedupe key `` `${course}:${dry|live}` ``

- [ ] **Step 1: Drop gradeType from the request body**

`routes/canvas.js:23`:

```js
  const { course, dryRun = true } = req.body || {};
```

- [ ] **Step 2: Simplify the dedupe key and the runner**

Replace `:42-47`:

```js
  // Dry and live runs are separate jobs for the same course, so key them apart —
  // otherwise a confirm would be deduped into the preview that is still running.
  const key = `${course}:${dryRun ? "dry" : "live"}`;
  const { jobId, reused } = jobs.start(key, () =>
    processCourse(course, { dryRun, verbose: false })
  );
```

Collapsing the two former `gradeType` variants is safe: with `gradeType` gone they compute byte-identical work, so this merges duplicates rather than conflating distinct runs. The `dry`/`live` split — the one that mattered — is untouched.

- [ ] **Step 3: Verify no gradeType references remain**

Run: `grep -rn "gradeType" routes/`
Expected: no output.

- [ ] **Step 4: Run the full suite**

Run: `yarn test`
Expected: 11 suites, 134 tests, all passing.

- [ ] **Step 5: Verify the endpoint by hand**

Start the backend: `yarn dev`

In another shell, replacing `<course>` with an active course key from your registry:

```bash
curl -s -X POST http://localhost:4001/api/canvas/export \
  -H 'Content-Type: application/json' \
  -d '{"course":"<course>","dryRun":true}'
```

Expected: `{"jobId":"1"}`. Then poll it:

```bash
curl -s http://localhost:4001/api/canvas/export/1 | head -c 300
```

Expected: `{"status":"running",…}` and, within a few seconds, `{"status":"done","result":{…}}`. If `CANVAS_TOKEN` is unset you will get `{"status":"error",…}` instead — that is the known limitation in the spec, not a regression from this task.

- [ ] **Step 6: Commit**

```bash
git add routes/canvas.js
git commit -m "refactor(canvas): drop gradeType from the export API"
```

---

### Task 4: Remove the selector from the UI

**Files:**
- Modify: `front/src/components/CanvasExportModal.js:22-28`, `:98`, `:152-157`, `:211-217`
- Modify: `front/src/pages/AdminPage.js:20`, `:55-64`, `:86-107`, `:164-170`

**Interfaces:**
- Consumes: the `POST /api/canvas/export` body shape from Task 3
- Produces: `<CanvasExportModal open course assignmentId onClose />` — no `gradeType` prop

- [ ] **Step 1: Remove gradeType from the modal's props and request**

In `front/src/components/CanvasExportModal.js`, change the request helper (`:11-20`) to stop sending it:

```js
async function startExport({ course, dryRun }) {
  const res = await fetch("/api/canvas/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ course, dryRun }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Export failed (${res.status})`);
  return data.jobId;
}
```

Change the component signature (`:22-28`):

```js
export default function CanvasExportModal({
  open,
  course,
  assignmentId,
  onClose,
}) {
```

Inside `run` (`:46`), drop it from the call and from the dependency array (`:68`):

```js
        const jobId = await startExport({ course, dryRun });
```

```js
    [course, stopPolling]
```

- [ ] **Step 2: Remove gradeType from the modal's rendered text**

`:98` — the title:

```js
              Export to Canvas — {course}
```

`:152-157` — the alert:

```js
                {!assignmentId && (
                  <div className="alert alert-info">
                    No lottery assignment is configured for this course. Submitting
                    will find or create one in Canvas.
                  </div>
                )}
```

`:211-217` — the propTypes:

```js
CanvasExportModal.propTypes = {
  open: PropTypes.bool.isRequired,
  course: PropTypes.string.isRequired,
  assignmentId: PropTypes.number,
  onClose: PropTypes.func.isRequired,
};
```

Leave the preview table (`:159-180`) alone — it already renders both Grade and Pts.

- [ ] **Step 3: Remove the selector from AdminPage**

In `front/src/pages/AdminPage.js`, delete the `gradeType` state line (`:20`).

Replace `:55-64`:

```js
  // Presence of a canvas block is what makes a course exportable. A null
  // assignment id is NOT disqualifying — the live run finds or creates it.
  const canvasConfig = getCanvasConfig(course);
  const assignmentId = canvasConfig?.lotteryAssignmentId;
  const exportTitle = canvasConfig
    ? "Preview and export lottery grades to Canvas"
    : `${course} is not wired for Canvas export`;
```

Replace the header controls (`:86-107`) — the whole `<div className="d-flex align-items-center" style={{ gap: "0.5rem" }}>` block — with just the button:

```js
          <div className="d-flex align-items-center" style={{ gap: "0.5rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setExportOpen(true)}
              disabled={!canvasConfig}
              title={exportTitle}
            >
              Export to Canvas
            </button>
          </div>
```

Update the modal usage (`:164-170`):

```js
        <CanvasExportModal
          open={exportOpen}
          course={course}
          assignmentId={assignmentId}
          onClose={() => setExportOpen(false)}
        />
```

- [ ] **Step 4: Verify no gradeType references remain**

Run: `grep -rn "gradeType" front/src/`
Expected: no output.

- [ ] **Step 5: Build the frontend**

Run: `cd front && yarn build`
Expected: `Compiled successfully.` No ESLint warnings about unused variables — if `gradeType` or `setGradeType` is reported unused, a reference was missed.

- [ ] **Step 6: Verify in the browser**

With `yarn dev` running, open `http://localhost:4001/admin`.

Expected: the "Grade type" dropdown is gone; "Export to Canvas" remains and still opens the modal; the modal title reads `Export to Canvas — <course>` with no parenthetical; the preview still lists students with Grade and Pts columns.

- [ ] **Step 7: Commit**

```bash
git add front/src/components/CanvasExportModal.js front/src/pages/AdminPage.js
git commit -m "refactor(canvas): remove the grade-type selector from the admin UI"
```

---

# Phase 2 — The Grade column

### Task 5: Extract the export job transport

**Files:**
- Create: `front/src/canvasExportJob.mjs`
- Test: `__tests__/canvas-export-job.test.mjs`

This runs under the **root** Jest (node env, `.mjs`), following the `__tests__/courses.test.mjs` precedent of testing a `front/src/*.mjs` module from the root suite.

**Interfaces:**
- Consumes: `POST /api/canvas/export` and `GET /api/canvas/export/:jobId` from Task 3
- Produces: `runExportJob({ course, dryRun, pollMs, deadlineMs, fetchImpl })` → `{ promise, cancel }`. `promise` resolves with the job's `result` object or rejects with an `Error`. `cancel()` stops polling; the promise then never settles.

- [ ] **Step 1: Write the failing test**

Create `__tests__/canvas-export-job.test.mjs`:

```js
import { runExportJob } from "../front/src/canvasExportJob.mjs";

// Builds a fake fetch that returns queued responses in order. The last
// response repeats forever, so a polling loop can keep calling it.
function fakeFetch(responses) {
  const queue = [...responses];
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    return {
      ok: next.ok !== false,
      status: next.status ?? 200,
      json: async () => next.body,
    };
  };
  impl.calls = calls;
  return impl;
}

const FAST = { pollMs: 1, deadlineMs: 500 };

describe("runExportJob", () => {
  test("resolves with the job result once the job is done", async () => {
    const fetchImpl = fakeFetch([
      { body: { jobId: "7" } },
      { body: { status: "running" } },
      { body: { status: "done", result: { success: true, studentsWithGrades: [] } } },
    ]);
    const { promise } = runExportJob({ course: "c", dryRun: true, fetchImpl, ...FAST });
    await expect(promise).resolves.toMatchObject({ success: true });
  });

  test("sends course and dryRun in the POST body", async () => {
    const fetchImpl = fakeFetch([
      { body: { jobId: "1" } },
      { body: { status: "done", result: { success: true } } },
    ]);
    const { promise } = runExportJob({ course: "abc", dryRun: true, fetchImpl, ...FAST });
    await promise;
    expect(JSON.parse(fetchImpl.calls[0].options.body)).toEqual({
      course: "abc",
      dryRun: true,
    });
  });

  test("rejects when the poll returns 404 instead of resolving as success", async () => {
    // Regression: the old inline loop never checked res.ok, so a 404 body with
    // no `status` fell through every branch and resolved with result undefined.
    const fetchImpl = fakeFetch([
      { body: { jobId: "1" } },
      { ok: false, status: 404, body: { error: "job not found" } },
    ]);
    const { promise } = runExportJob({ course: "c", dryRun: true, fetchImpl, ...FAST });
    await expect(promise).rejects.toThrow(/job not found/);
  });

  test("rejects when the POST itself fails", async () => {
    const fetchImpl = fakeFetch([
      { ok: false, status: 400, body: { error: "c is not wired for Canvas export." } },
    ]);
    const { promise } = runExportJob({ course: "c", dryRun: true, fetchImpl, ...FAST });
    await expect(promise).rejects.toThrow(/not wired for Canvas export/);
  });

  test("surfaces a job-level error", async () => {
    const fetchImpl = fakeFetch([
      { body: { jobId: "1" } },
      { body: { status: "error", error: "canvas exploded" } },
    ]);
    const { promise } = runExportJob({ course: "c", dryRun: true, fetchImpl, ...FAST });
    await expect(promise).rejects.toThrow("canvas exploded");
  });

  test("surfaces a result-level failure", async () => {
    const fetchImpl = fakeFetch([
      { body: { jobId: "1" } },
      { body: { status: "done", result: { success: false, error: "Course not found" } } },
    ]);
    const { promise } = runExportJob({ course: "c", dryRun: true, fetchImpl, ...FAST });
    await expect(promise).rejects.toThrow("Course not found");
  });

  test("rejects on an unrecognized job status", async () => {
    const fetchImpl = fakeFetch([
      { body: { jobId: "1" } },
      { body: { status: "banana" } },
    ]);
    const { promise } = runExportJob({ course: "c", dryRun: true, fetchImpl, ...FAST });
    await expect(promise).rejects.toThrow(/unexpected job status/i);
  });

  test("rejects when a done job carries no result", async () => {
    const fetchImpl = fakeFetch([
      { body: { jobId: "1" } },
      { body: { status: "done" } },
    ]);
    const { promise } = runExportJob({ course: "c", dryRun: true, fetchImpl, ...FAST });
    await expect(promise).rejects.toThrow(/no result/i);
  });

  test("rejects once the deadline passes", async () => {
    const fetchImpl = fakeFetch([
      { body: { jobId: "1" } },
      { body: { status: "running" } },
    ]);
    const { promise } = runExportJob({
      course: "c",
      dryRun: true,
      fetchImpl,
      pollMs: 1,
      deadlineMs: 30,
    });
    await expect(promise).rejects.toThrow(/timed out/i);
  });

  test("stops polling after cancel", async () => {
    const fetchImpl = fakeFetch([
      { body: { jobId: "1" } },
      { body: { status: "running" } },
    ]);
    const { cancel } = runExportJob({ course: "c", dryRun: true, fetchImpl, ...FAST });
    await new Promise((r) => setTimeout(r, 20));
    cancel();
    const after = fetchImpl.calls.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchImpl.calls.length).toBe(after);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test __tests__/canvas-export-job.test.mjs`
Expected: FAIL — cannot find module `../front/src/canvasExportJob.mjs`.

- [ ] **Step 3: Write the implementation**

Create `front/src/canvasExportJob.mjs`:

```js
// Start-and-poll transport for Canvas export jobs. Both the export modal and
// the admin Grade column go through here, so a preview and the table can never
// disagree about what the server said.
//
// This deliberately does NOT reproduce the previous inline polling loop's error
// handling. That loop never checked res.ok, so a 404 ("job not found", which
// happens on every backend restart) parsed to a body with no `status`, matched
// no branch, and resolved as success with an undefined result.

const DEFAULT_POLL_MS = 1500;
const DEFAULT_DEADLINE_MS = 120000;

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function runExportJob({
  course,
  dryRun,
  pollMs = DEFAULT_POLL_MS,
  deadlineMs = DEFAULT_DEADLINE_MS,
  fetchImpl = fetch,
}) {
  let cancelled = false;
  let timer = null;

  const cancel = () => {
    cancelled = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const promise = new Promise((resolve, reject) => {
    const sleep = (ms) =>
      new Promise((r) => {
        timer = setTimeout(r, ms);
      });

    (async () => {
      const startRes = await fetchImpl("/api/canvas/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course, dryRun }),
      });
      const startBody = await readJson(startRes);
      if (!startRes.ok) {
        throw new Error(startBody.error || `Export failed (${startRes.status})`);
      }
      const { jobId } = startBody;
      if (!jobId) throw new Error("Export did not return a job id.");

      const deadline = Date.now() + deadlineMs;

      for (;;) {
        if (cancelled) return undefined;
        await sleep(pollMs);
        if (cancelled) return undefined;

        const res = await fetchImpl(`/api/canvas/export/${jobId}`);
        const job = await readJson(res);
        if (!res.ok) {
          throw new Error(job.error || `Could not read job ${jobId} (${res.status})`);
        }

        if (job.status === "running") {
          if (Date.now() > deadline) {
            throw new Error("Canvas export timed out. Try again.");
          }
          continue;
        }
        if (job.status === "error") {
          throw new Error(job.error || "Canvas export failed.");
        }
        if (job.status !== "done") {
          throw new Error(`Canvas export returned an unexpected job status: ${job.status}`);
        }
        if (!job.result) {
          throw new Error("Canvas export finished with no result.");
        }
        if (job.result.success === false) {
          throw new Error(job.result.error || "Canvas export failed.");
        }
        return job.result;
      }
    })().then(
      (value) => {
        if (!cancelled) resolve(value);
      },
      (error) => {
        if (!cancelled) reject(error);
      }
    );
  });

  return { promise, cancel };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test __tests__/canvas-export-job.test.mjs`
Expected: PASS, 10 tests.

- [ ] **Step 5: Run the full suite**

Run: `yarn test`
Expected: 12 suites, 144 tests, all passing.

- [ ] **Step 6: Commit**

```bash
git add front/src/canvasExportJob.mjs __tests__/canvas-export-job.test.mjs
git commit -m "feat(canvas): extract the export job transport

Also fixes a latent bug the inline loop had: it never checked res.ok, so
a 404 job-not-found (every backend restart) resolved as success with an
undefined result."
```

---

### Task 6: Move the modal onto the shared transport

**Files:**
- Modify: `front/src/components/CanvasExportModal.js:1-76`

**Interfaces:**
- Consumes: `runExportJob` from Task 5
- Produces: unchanged modal behavior

- [ ] **Step 1: Replace the transport, keep the state machine**

Replace everything from the imports through the `useEffect` (`:1-76`) with:

```js
import React, { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { runExportJob } from "../canvasExportJob.mjs";

// Preview-before-write modal for Canvas grade export. Opens on a dry run,
// renders the computed grades, and only writes when the instructor confirms.
// The confirm re-runs the export live rather than replaying the preview, so a
// stale preview can never submit old grades.

export default function CanvasExportModal({
  open,
  course,
  assignmentId,
  onClose,
}) {
  const [phase, setPhase] = useState("running"); // running|preview|committing|done|error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const jobRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (jobRef.current) {
      jobRef.current.cancel();
      jobRef.current = null;
    }
  }, []);

  const run = useCallback(
    (dryRun) => {
      setPhase(dryRun ? "running" : "committing");
      setError(null);

      const job = runExportJob({ course, dryRun });
      jobRef.current = job;

      job.promise.then(
        (jobResult) => {
          jobRef.current = null;
          setResult(jobResult);
          setPhase(dryRun ? "preview" : "done");
        },
        (err) => {
          jobRef.current = null;
          setError(err.message);
          setPhase("error");
        }
      );
    },
    [course]
  );

  useEffect(() => {
    if (!open) return undefined;
    setResult(null);
    run(true);
    return stopPolling;
  }, [open, run, stopPolling]);
```

Everything below `:78` (`if (!open) return null;` onward) is unchanged.

Note the deleted `POLL_MS` constant and `startExport` helper — both moved into `canvasExportJob.mjs` in Task 5.

- [ ] **Step 2: Verify the old transport is gone**

Run: `grep -n "POLL_MS\|setInterval\|startExport" front/src/components/CanvasExportModal.js`
Expected: no output.

- [ ] **Step 3: Build**

Run: `cd front && yarn build`
Expected: `Compiled successfully.`

- [ ] **Step 4: Verify in the browser**

With `yarn dev` running, open `http://localhost:4001/admin` and click **Export to Canvas**.

Expected: the modal opens showing "Computing grades…", then a preview table with student rows, median line, and any unmatched warning — same as before the refactor. Close without submitting.

Then, to confirm the 404 fix: open the modal, and while it shows "Computing grades…", save any backend file so nodemon restarts. Expected: the modal shows an **error message**, not an empty preview. Before this change it would have shown a blank preview table.

- [ ] **Step 5: Run the full suite**

Run: `yarn test`
Expected: 12 suites, 144 tests, all passing.

- [ ] **Step 6: Commit**

```bash
git add front/src/components/CanvasExportModal.js
git commit -m "refactor(canvas): move the export modal onto the shared job transport"
```

---

### Task 7: Add the Grade column to the student table

Built and tested standalone before it is wired up, so the column's rendering, tinting, and sorting are pinned independently of the page.

**Files:**
- Modify: `front/src/components/StudentTable.js`
- Test: `front/src/components/StudentTable.test.js`

These tests run under **CRA's Jest**, not the root one.

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `<StudentTable counts allGrades onShowHistory studentIdMap anonymize searchFilter canvasGrades unmatchedNames gradesStatus />` where `canvasGrades` is `{ [lotteryName]: number } | null`, `unmatchedNames` is a `Set<string>`, and `gradesStatus` is `"idle" | "loading" | "ready" | "error"`

- [ ] **Step 1: Write the failing test**

Create `front/src/components/StudentTable.test.js`:

```js
import React from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";
import StudentTable from "./StudentTable";
import { SelectionProvider } from "../context/SelectionContext";

const COUNTS = [
  { _id: "ADA LOVELACE", count: 12, sum: 18 },
  { _id: "ALAN TURING", count: 7, sum: 9 },
  { _id: "GRACE HOPPER", count: 2, sum: 1 },
];

function renderTable(props = {}) {
  return render(
    <SelectionProvider>
      <StudentTable
        counts={COUNTS}
        allGrades={[]}
        onShowHistory={() => {}}
        {...props}
      />
    </SelectionProvider>
  );
}

// Returns the Grade cell text for a given student row.
function gradeCellFor(name) {
  const row = screen.getByText(name).closest("tr");
  return within(row).getAllByRole("cell")[4].textContent;
}

describe("StudentTable Grade column", () => {
  test("renders a Grade header", () => {
    renderTable();
    expect(screen.getByText(/^Grade/)).toBeInTheDocument();
  });

  test("shows a dash for every row when idle", () => {
    renderTable({ gradesStatus: "idle" });
    expect(gradeCellFor("ADA LOVELACE")).toBe("–");
  });

  test("shows a dot for every row while loading", () => {
    renderTable({ gradesStatus: "loading" });
    expect(gradeCellFor("ADA LOVELACE")).toBe("·");
  });

  test("shows the grade when one is loaded", () => {
    renderTable({
      gradesStatus: "ready",
      canvasGrades: { "ADA LOVELACE": 107.3, "ALAN TURING": 98.1 },
    });
    expect(gradeCellFor("ADA LOVELACE")).toBe("107.3");
    expect(gradeCellFor("ALAN TURING")).toBe("98.1");
  });

  test("shows a warning for a student with no Canvas match", () => {
    renderTable({
      gradesStatus: "ready",
      canvasGrades: { "ADA LOVELACE": 107.3 },
      unmatchedNames: new Set(["GRACE HOPPER"]),
    });
    expect(gradeCellFor("GRACE HOPPER")).toBe("⚠");
  });

  test("shows a dash for a student who is neither graded nor unmatched", () => {
    renderTable({
      gradesStatus: "ready",
      canvasGrades: { "ADA LOVELACE": 107.3 },
      unmatchedNames: new Set(),
    });
    expect(gradeCellFor("ALAN TURING")).toBe("–");
  });
});

describe("StudentTable Grade sorting", () => {
  const graded = {
    gradesStatus: "ready",
    canvasGrades: { "ADA LOVELACE": 107.3, "ALAN TURING": 98.1 },
    unmatchedNames: new Set(["GRACE HOPPER"]),
  };

  // Row order by name. Cell 0 is Name (anonymize defaults to false).
  function gradeColumnOrder() {
    const rows = screen.getAllByRole("row").slice(1); // drop the header row
    return rows.map((r) => within(r).getAllByRole("cell")[0].textContent);
  }

  // Header order: Name, #Calls, Points, Pts/Call, Grade, Last 10, (actions).
  function gradeHeader() {
    return screen.getByText(/^Grade/);
  }

  test("ungraded rows sort last ascending", () => {
    renderTable(graded);
    fireEvent.click(gradeHeader());
    expect(gradeColumnOrder()).toEqual(["ALAN TURING", "ADA LOVELACE", "GRACE HOPPER"]);
  });

  test("ungraded rows sort last descending too", () => {
    renderTable(graded);
    fireEvent.click(gradeHeader()); // asc
    fireEvent.click(gradeHeader()); // desc
    expect(gradeColumnOrder()).toEqual(["ADA LOVELACE", "ALAN TURING", "GRACE HOPPER"]);
  });

  test("tied grades break by points descending", () => {
    renderTable({
      gradesStatus: "ready",
      canvasGrades: {
        "ADA LOVELACE": 100,
        "ALAN TURING": 100,
        "GRACE HOPPER": 100,
      },
      unmatchedNames: new Set(),
    });
    fireEvent.click(gradeHeader());
    // All tied at 100, so points (18, 9, 1) descending decides.
    expect(gradeColumnOrder()).toEqual(["ADA LOVELACE", "ALAN TURING", "GRACE HOPPER"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd front && CI=true yarn test --testPathPattern StudentTable`
Expected: FAIL — no Grade header, and the cell index 4 is the Last-10 column.

- [ ] **Step 3: Add the color helper**

In `front/src/components/StudentTable.js`, just below the `compactTableStyles` template literal (after `:25`), add:

```js
// Grades run roughly -100..110 with 100 as the median. Deriving the extent from
// the data would normalize the entire below-median range across [min, 100],
// which paints a student at 78 — a full SD below, a real penalty — essentially
// white, while squeezing everyone above the median into 100..110 and giving
// them the whole blue half. A fixed, clamped domain keeps the tint honest.
const GRADE_EXTENT = [60, 110];
const GRADE_CENTER = 100;

const EMPTY_SET = new Set();
```

- [ ] **Step 4: Accept the new props**

Change the component signature (`:27`):

```js
function StudentTable({
  counts,
  allGrades,
  onShowHistory,
  studentIdMap,
  anonymize = false,
  searchFilter = "",
  canvasGrades = null,
  unmatchedNames = EMPTY_SET,
  gradesStatus = "idle",
}) {
```

- [ ] **Step 5: Attach the grade to each row**

In the `studentData` `useMemo` (`:57-76`), add a `grade` field to the returned object and extend the dependency array:

```js
      return {
        name: name,
        id: studentId,
        calls: calls,
        points: points,
        callsPerClass: calls > 0 ? (points / calls).toFixed(2) : "0.00",
        last10: last10,
        grade: canvasGrades?.[name] ?? null,
      };
    });

    return data;
  }, [counts, studentIdMap, last10ByStudent, canvasGrades]);
```

- [ ] **Step 6: Add the grade color helper**

Below the existing `getCellColor` function (after `:111`), add:

```js
  // Clamp into the fixed domain first: a grade of -100 and one of 60 should
  // both read as "as red as it gets" rather than rescaling everyone else.
  const getGradeColor = (grade) => {
    if (grade == null) return "transparent";
    const clamped = Math.max(GRADE_EXTENT[0], Math.min(GRADE_EXTENT[1], grade));
    return getCellColor(clamped, GRADE_CENTER, GRADE_EXTENT);
  };
```

- [ ] **Step 7: Add grade sorting**

Replace the `sortedData` `useMemo` (`:113-133`) with:

```js
  const sortedData = useMemo(() => {
    const sorted = [...studentData];

    sorted.sort((a, b) => {
      if (sortColumn === "grade") {
        // Rank is applied OUTSIDE the direction flip so ungraded rows stay last
        // in both directions — inside the comparator below, which negates the
        // whole result, they would jump to the top when descending.
        const rank = (s) => (s.grade == null ? 1 : 0);
        const rankDiff = rank(a) - rank(b);
        if (rankDiff !== 0) return rankDiff;

        if (a.grade !== b.grade) {
          return sortDirection === "asc" ? a.grade - b.grade : b.grade - a.grade;
        }
        // Ties are the common case, not an edge case: every student at the
        // class median scores exactly 100. Break by points, then name.
        if (a.points !== b.points) return b.points - a.points;
        return a.name.localeCompare(b.name);
      }

      let aVal = a[sortColumn];
      let bVal = b[sortColumn];

      // Handle numeric vs string comparison
      if (sortColumn === "calls" || sortColumn === "points") {
        aVal = Number(aVal);
        bVal = Number(bVal);
      } else if (sortColumn === "callsPerClass") {
        aVal = parseFloat(aVal);
        bVal = parseFloat(bVal);
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [studentData, sortColumn, sortDirection]);
```

- [ ] **Step 8: Add the cell renderer**

Below `renderLast10` (after `:183`), add:

```js
  const renderGrade = (student) => {
    if (gradesStatus === "loading") return <span style={{ color: "#999" }}>·</span>;
    if (student.grade != null) return student.grade;
    if (gradesStatus === "ready" && unmatchedNames.has(student.name)) {
      return (
        <span
          style={{ color: "#fd7e14" }}
          title="No Canvas match — will not be graded"
        >
          {"⚠"}
        </span>
      );
    }
    return <span style={{ color: "#999" }}>{"–"}</span>;
  };
```

- [ ] **Step 9: Add the header and the cell**

Add a new `<th>` after the Pts/Call header (after `:226`), before `<th>Last 10</th>`:

```js
              <th
                style={{ cursor: "pointer" }}
                onClick={() => handleSort("grade")}
              >
                Grade{getSortIndicator("grade")}
              </th>
```

Add the matching `<td>` after the Pts/Call cell (after `:248`), before the Last-10 cell:

```js
                <td style={{ backgroundColor: getGradeColor(student.grade) }}>
                  {renderGrade(student)}
                </td>
```

- [ ] **Step 10: Add the propTypes**

Extend `StudentTable.propTypes` (`:270-277`):

```js
StudentTable.propTypes = {
  counts: PropTypes.array.isRequired,
  allGrades: PropTypes.array.isRequired,
  onShowHistory: PropTypes.func.isRequired,
  studentIdMap: PropTypes.object,
  anonymize: PropTypes.bool,
  searchFilter: PropTypes.string,
  canvasGrades: PropTypes.object,
  unmatchedNames: PropTypes.instanceOf(Set),
  gradesStatus: PropTypes.oneOf(["idle", "loading", "ready", "error"]),
};
```

- [ ] **Step 11: Run test to verify it passes**

Run: `cd front && CI=true yarn test --testPathPattern StudentTable`
Expected: PASS, 9 tests.

- [ ] **Step 12: Build and commit**

Run: `cd front && yarn build`
Expected: `Compiled successfully.`

```bash
git add front/src/components/StudentTable.js front/src/components/StudentTable.test.js
git commit -m "feat(admin): add a Canvas Grade column to the student table

Fixed color domain rather than a data-derived extent: with grades spanning
-100..110, normalizing across the observed range renders a 1-SD penalty
essentially white. Ungraded rows rank outside the sort direction flip so
they stay last both ways, and tied grades — every student at the median
scores exactly 100 — break by points then name."
```

---

### Task 8: Wire the Grade column into AdminPage

**Files:**
- Modify: `front/src/pages/AdminPage.js`

**Interfaces:**
- Consumes: `runExportJob` (Task 5), the `StudentTable` props (Task 7)
- Produces: nothing downstream

- [ ] **Step 1: Add the import and state**

Add to the imports at the top of `front/src/pages/AdminPage.js`:

```js
import { runExportJob } from "../canvasExportJob.mjs";
```

Add beside the other `useState` calls:

```js
  const [canvasGrades, setCanvasGrades] = useState(null); // { byName, unmatched, loadedAt }
  const [gradesStatus, setGradesStatus] = useState("idle"); // idle|loading|ready|error
  const [gradesError, setGradesError] = useState(null);
  const gradeJobRef = useRef(null);
```

Add `useRef` to the React import:

```js
import React, { useEffect, useState, useCallback, useRef } from "react";
```

- [ ] **Step 2: Make refreshData awaitable**

The Load handler must refresh the table before grading, so `refreshData` needs to return a promise. Replace it (`:23-31`):

```js
  const refreshData = useCallback(() => {
    const counts = fetch("getCounts/" + course)
      .then((res) => res.json())
      .then((_counts) => setCounts(_counts));

    const grades = fetch("getAllGrades/" + course)
      .then((res) => res.json())
      .then((_grades) => setAllGrades(_grades));

    return Promise.all([counts, grades]);
  }, [course]);
```

- [ ] **Step 3: Add the load handler**

Below `handleStudentIdMapReady`:

```js
  const handleLoadGrades = useCallback(async () => {
    setGradesStatus("loading");
    setGradesError(null);

    // Refresh the table first. refreshData reads Mongo at page load; the dry
    // run re-reads it server-side at click time. Without this, Grade would be
    // computed from a newer dataset than every other column — a row could read
    // "Points: 12" beside a grade computed from 14.
    try {
      await refreshData();
    } catch {
      // A failed refresh is not fatal — the grades are still worth loading,
      // and the stale-Points risk is what the caption's timestamp is for.
    }

    const job = runExportJob({ course, dryRun: true });
    gradeJobRef.current = job;

    try {
      const result = await job.promise;
      gradeJobRef.current = null;
      setCanvasGrades({
        byName: Object.fromEntries(
          (result.studentsWithGrades || [])
            .filter((s) => s.lotteryName)
            .map((s) => [s.lotteryName, s.grade])
        ),
        unmatched: new Set((result.unmatchedLottery || []).map((u) => u.name)),
        loadedAt: new Date(),
      });
      setGradesStatus("ready");
    } catch (err) {
      gradeJobRef.current = null;
      setGradesError(err.message);
      setGradesStatus("error");
    }
  }, [course, refreshData]);
```

- [ ] **Step 4: Clear on course change**

Add below the existing `useEffect`:

```js
  // Grades belong to the course they were computed for. Cancel any in-flight
  // job too, so a slow response for the previous course cannot land on the new
  // one and quietly mislabel every row.
  useEffect(() => {
    setCanvasGrades(null);
    setGradesStatus("idle");
    setGradesError(null);
    return () => {
      if (gradeJobRef.current) {
        gradeJobRef.current.cancel();
        gradeJobRef.current = null;
      }
    };
  }, [course]);
```

- [ ] **Step 5: Add the Load button**

In the header control block from Task 4, add the button before "Export to Canvas":

```js
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={handleLoadGrades}
              disabled={!canvasConfig || gradesStatus === "loading"}
              title={
                canvasConfig
                  ? "Fetch the grades Canvas would receive"
                  : `${course} is not wired for Canvas export`
              }
            >
              {gradesStatus === "loading" ? "Loading grades…" : "Load Canvas grades"}
            </button>
```

- [ ] **Step 6: Pass the props and add the caption**

Update the `<StudentTable>` usage:

```js
            <StudentTable
              counts={counts}
              allGrades={allGrades}
              onShowHistory={handleShowHistory}
              studentIdMap={studentIdMap}
              anonymize={anonymize}
              searchFilter={searchName}
              canvasGrades={canvasGrades?.byName ?? null}
              unmatchedNames={canvasGrades?.unmatched ?? EMPTY_SET}
              gradesStatus={gradesStatus}
            />
```

Add the module-level constant near the top of the file, below the imports:

```js
// Stable identity so the prop does not change on every render and defeat
// StudentTable's useMemo dependencies.
const EMPTY_SET = new Set();
```

Add the caption directly below `<StudentTable>`, inside the same column div:

```js
            {gradesStatus === "ready" && (
              <small className="text-muted mt-1">
                Canvas grades loaded{" "}
                {canvasGrades.loadedAt.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 align-baseline"
                  onClick={handleLoadGrades}
                >
                  Reload
                </button>
              </small>
            )}
            {gradesStatus === "error" && (
              <small className="text-danger mt-1">
                {gradesError}{" "}
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 align-baseline"
                  onClick={handleLoadGrades}
                >
                  Retry
                </button>
              </small>
            )}
```

- [ ] **Step 7: Build**

Run: `cd front && yarn build`
Expected: `Compiled successfully.` with no unused-variable warnings.

- [ ] **Step 8: Verify in the browser**

With `yarn dev` running, open `http://localhost:4001/admin`.

1. The Grade column shows `–` in every row, and **Load Canvas grades** is enabled.
2. Click it. The button reads "Loading grades…"; the Grade cells show `·`.
3. On completion: numbers appear, tinted blue above 100 and red below; a caption reads `Canvas grades loaded HH:MM` with a Reload link.
4. Click the **Grade** header. Rows sort by grade; any `⚠` rows sit at the bottom. Click again — they are still at the bottom.
5. Open **Export to Canvas** and compare the modal's preview numbers against the column. **They must match exactly.**
6. Switch course. The Grade column resets to `–` and the caption disappears.

- [ ] **Step 9: Run both suites**

Run: `yarn test`
Expected: 12 suites, 144 tests, all passing.

Run: `cd front && CI=true yarn test --watchAll=false`
Expected: all passing.

- [ ] **Step 10: Commit**

```bash
git add front/src/pages/AdminPage.js
git commit -m "feat(admin): load Canvas grades on demand into the student table

Load refreshes the table before running the dry run: refreshData reads
Mongo at page load while the dry run re-reads it at click time, so without
the refresh the Grade column would be computed from a newer snapshot than
every other column."
```

---

## Known limitations — deliberately not built

Documented in the spec, listed here so nobody 'fixes' them mid-plan and expands scope:

1. Students enrolled in Canvas with no lottery entries are graded at 0 and move the median, but never appear in the column.
2. `displaced: true` unmatched entries get the generic "No Canvas match" tooltip; they actually matched at ≥70% confidence and lost a claim.
3. A missing `CANVAS_TOKEN` fails a poll cycle after the click rather than disabling the button up front.
4. `job-store.mjs` never prunes its `jobs` Map.
5. Confirming a live export does not invalidate an already-loaded Grade column.
6. Job dedupe is per-process; a CLI export and a server export can interleave.

Pre-existing export bugs found during review are filed separately as
[#5](https://github.com/john-guerra/lotteryViz/issues/5) and
[#6](https://github.com/john-guerra/lotteryViz/issues/6). Do not fix them here.
