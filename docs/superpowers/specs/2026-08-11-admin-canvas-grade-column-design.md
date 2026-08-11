# Export Both Canvas Grades, and Show the Grade on the Admin Table

**Date:** 2026-08-11
**Status:** Approved design

## Summary

Two sequenced changes:

**Phase 1 — Export both grades.** A Canvas export currently sends one number to one
assignment, chosen by a `gradeType` selector. It should always send both: the curved
**Lottery Grade** and the raw **Accumulated Points** tally, each to its own
assignment. The selector is removed.

**Phase 2 — Grade column.** Add a **Grade** column to the Admin student table showing
the exact curved grade each student will receive in Canvas, sourced from the existing
export dry run rather than recomputed locally.

Phase 1 lands first so Phase 2 is built against corrected behavior and never has to
encode `gradeType` logic it would immediately shed.

## Background

### The grade formula

`export-lottery-to-canvas.mjs:422` `computeGrade()` turns accumulated points into a
percentile/SD score:

- at the class median → 100
- above median → linear up to 110
- below median → quadratic penalty (1 SD → 78, 2 SD → 11, 3 SD → −100)

Points are shifted by `classes[course].medianAdjustment` before grading (`:668`), and
the median is the upper-middle element `adjustedPointsSorted[floor(n/2)]` (`:676`) —
deliberately not `d3.median`.

### The selector does not select anything

`gradeType` chooses only the **destination**:

| Line | What `gradeType` decides |
|---|---|
| `:559-562` | which `assignmentId` to POST to |
| `:804` | the assignment name, if one must be created |

The **value** submitted is `student.grade` unconditionally (`:884`) — the curved
grade — in both branches. `createLotteryAssignment:475` also hardcodes
`points_possible: 100` for both. So exporting "Accumulated" today posts the curved
percentile grade to an assignment named "Lottery Accumulated Points", not the raw
tally. Live assignment IDs are configured for two courses, so this reaches Canvas.

The intent was always two distinct assignments: a *relative* measure (how you did
versus classmates) and an *absolute* one (how much you actually did). Phase 1 makes
that true, and since both should always be sent, the selector has nothing to select.

### The dry run is the source of truth for Phase 2

`processCourse` grades against **Canvas enrollments**, not the local roster — enrolled
students with no lottery entries are folded in at 0 points (`:646-652`), which moves
the median for everyone. It also fuzzy-matches lottery names to Canvas names
(`matchLotteryToCanvas:317`); students who fail to match receive *no grade at all*,
and `CanvasExportModal.js:135` already has UI for that case, so it happens in practice.

A local reimplementation could reproduce the arithmetic but neither of those. It would
print confident numbers for students Canvas is going to skip. So Phase 2 reads the
dry run instead: `POST /api/canvas/export {dryRun: true}` → poll
`GET /api/canvas/export/:jobId` → `result`.

## Decisions

| Question | Decision |
|---|---|
| What an export sends | Both grades, every run |
| Grade type selector | Removed — UI, API, and CLI |
| Only one assignment ID configured | Send what is configured, report the skip visibly |
| Auto-created accumulated assignment | `omit_from_final_grade: true`, `points_possible` stays 100 |
| Phase 2 grade source | The existing dry-run job, on demand |
| Which population sets the median | Canvas enrollments, inherited from the dry run |
| Course switch | Clear loaded grades back to idle |
| Staleness signal | Timestamp caption + Reload button |

The accumulated assignment is a **tally, not a grade**. `omit_from_final_grade` keeps
it from distorting course grades, which makes its denominator cosmetic — so
`points_possible: 100` can stand and there is no per-course number to maintain. The
Lottery Grade remains the thing that counts.

The roster-vs-counts question raised during design is **moot**: the dry run grades
against Canvas enrollments, which is strictly more faithful than either local option.

---

# Phase 1 — Export both grades

## `export-lottery-to-canvas.mjs`

`processCourse(courseName, { dryRun, verbose })` — the `gradeType` option is dropped.

Student grading is unchanged; `studentsWithGrades` already carries both numbers per
student (`.grade` curved, `.points` raw), so no recomputation is needed.

Submission becomes a loop over two **targets**:

| Target | Assignment ID | Value submitted | Auto-create name |
|---|---|---|---|
| `lottery` | `lotteryAssignmentId` | `student.grade` | `Lottery Grade` |
| `accumulated` | `accumulatedPointsAssignmentId` | `student.points` | `Lottery Accumulated Points` |

A target whose assignment ID is `null` and which cannot be resolved by name lookup is
**skipped, not failed** — recorded with `status: "skipped"` and a reason. The export
still succeeds. A partially wired course stays exportable.

`createLotteryAssignment` gains two parameters so the accumulated assignment is
created as a tally: `omitFromFinalGrade` (sets `assignment.omit_from_final_grade`) and
the existing name. `points_possible` stays 100 for both.

`verifyGrades` runs per target against that target's submitted values.

### Return shape

```js
{
  success, courseName, stats, studentsWithGrades, unmatchedLottery,
  targets: [
    { type: "lottery", assignmentId, assignmentName, assignmentGroupName,
      status: "sent" | "skipped" | "error",
      submitted, errors, verification, reason }
  ]
}
```

`submitted`, `errors`, and `verification` move from the top level into each target.

### Canvas comments

**Assumption, flagged for review:** the existing rich comment — grade, percentile,
formula, Slack participation, full point history (`:868-873`) — goes on the **Lottery
Grade** submission only, since it explains the curve. The accumulated submission gets
a one-line comment (`🤖Lottery bot | N participation points`). Posting the full history
twice would double the comment volume in the gradebook for no added information.

### CLI

`--grade-type` / `-g` is removed from `parseArgs` (`:964`) and the usage text
(`:974`). Every run exports both. Passing the flag errors with a message saying so,
rather than being silently ignored.

## `routes/canvas.js`

`gradeType` is dropped from the request body (`:23`). The job dedupe key becomes
`` `${course}:${dryRun ? "dry" : "live"}` `` (`:44`).

## `front/src/components/CanvasExportModal.js`

The `gradeType` prop is removed. The preview table gains a second numeric column so
both numbers are visible before writing:

| Name | Points | Grade |
|---|---|---|

Above the table, one line per target showing where each is going, including skips:

```
Lottery Grade       → "Lottery Grade" (3094551)          28 grades
Accumulated Points  → not configured — will be skipped    ⚠
```

The existing unmatched-students warning (`:135`) is unchanged.

## `front/src/pages/AdminPage.js`

The Grade type `<select>` (`:87-97`) is removed, along with `gradeType` state (`:20`)
and the `assignmentId` derivation (`:58-61`). The Export button's `disabled` condition
stays `!canvasConfig`. `exportTitle` loses its grade-type interpolation.

---

# Phase 2 — Grade column on the student table

## Section 1 — Extract the export job client

New `front/src/canvasExportJob.mjs`:

```js
// Starts a Canvas export job and polls it to completion.
// `promise` resolves with the job result, or rejects with an Error.
// `cancel()` stops polling so callers can abort on unmount.
runExportJob({ course, dryRun }) -> { promise, cancel }
```

It owns `startExport` and the `POLL_MS` loop currently inline in
`CanvasExportModal.js:11-69`, preserving the existing error precedence:
`job.status === "error"` → `job.error`; then `job.result?.success === false` →
`job.result.error`; otherwise resolve `job.result`.

`CanvasExportModal` is refactored onto it — its `phase` state machine stays in the
component, only the transport moves. `AdminPage` becomes the second consumer. One
code path to the dry run means the column and the modal cannot disagree.

## Section 2 — AdminPage state

```js
const [canvasGrades, setCanvasGrades] = useState(null);   // { byName, unmatched, loadedAt }
const [gradesStatus, setGradesStatus] = useState("idle");  // idle|loading|ready|error
const [gradesError, setGradesError] = useState(null);
```

A **Load Canvas grades** button sits beside Export, disabled when `!canvasConfig`
(same condition as Export) or while loading.

On success the result is reduced to:

- `byName` — `Object.fromEntries(studentsWithGrades.filter(s => s.lotteryName).map(s => [s.lotteryName, s.grade]))`
- `unmatched` — `new Set(unmatchedLottery.map(u => u.name))`
- `loadedAt` — capture time for the caption

The join key is free: `studentsWithGrades[].lotteryName` and `unmatchedLottery[].name`
are both the Mongo aggregation `_id`, the same string `StudentTable.js:58` already
keys rows by. No matching logic on our side.

Only the curved grade is surfaced. The accumulated value is `student.points`, which
the existing **Points** column already shows.

### Clearing

A `useEffect` keyed on `[course]` resets `canvasGrades` to `null` and `gradesStatus`
to `"idle"`, cancelling any in-flight job via its `cancel` handle so a slow response
for the previous course cannot land on the new one. With `gradeType` gone in Phase 1,
course is the only trigger.

There is no live-update path — `refreshData` runs only on mount and course change
(`AdminPage.js:33-35`), and the frontend has no polling or socket. Table data cannot
change mid-session, so `Points` is exactly as stale as `Grade`. No snapshot-comparison
staleness tracking is built.

### Caption

Below the table when `gradesStatus === "ready"`: `Canvas grades loaded 14:32` with a
**Reload** button. On `"error"`, the caption shows the error text and a Retry button.

## Section 3 — The Grade column

`StudentTable` gains three props, all optional with safe defaults so the table renders
unchanged before first load, and all with `propTypes`:

| Prop | Type | Passed from `AdminPage` as |
|---|---|---|
| `canvasGrades` | object or null | `canvasGrades?.byName ?? null` |
| `unmatchedNames` | Set | `canvasGrades?.unmatched ?? EMPTY_SET` |
| `gradesStatus` | string | `gradesStatus` |

`EMPTY_SET` is a module-level constant so prop identity stays stable across renders
and does not defeat the table's `useMemo`s.

The column sits between Pts/Call and Last 10:

| Row state | Renders |
|---|---|
| `idle` | `–`, muted |
| `loading` | `·` in cells, spinner in header |
| has a grade | e.g. `107.3`, RdBu-tinted via `getCellColor` centered on 100 |
| in `unmatchedNames` | `⚠` amber, `title="No Canvas match — will not be graded"` |
| `ready` but absent | `–`, muted |

Tinting reuses `getCellColor(value, median, extent)` with `median = 100` and extent
from the loaded grades, so it reads consistently with the Calls and Points columns.

Sorting adds `"grade"` to the numeric branch at `StudentTable.js:120`. Rows without a
grade sort last in **both** directions, so ascending never buries graded rows under a
block of `–`.

Anonymize is unaffected — it governs only the Name cell.

## Testing

**Phase 1**

- `processCourse` dry run returns a `targets` array with both entries.
- A course with `accumulatedPointsAssignmentId: null` yields `status: "skipped"` with
  a reason, and `success: true`.
- The accumulated target submits `student.points`, the lottery target
  `student.grade` — asserted distinct for a student whose points ≠ grade.
- `createLotteryAssignment` sets `omit_from_final_grade` only for the accumulated
  assignment.
- Passing `--grade-type` exits with an explanatory error.

**Phase 2**

- `runExportJob`: resolves on success, surfaces `job.error`, surfaces
  `job.result.error` when `success === false`, stops polling after `cancel()`.
- `StudentTable` renders each of the five row states above.
- Ungraded rows sort last ascending *and* descending.
- Regression: `CanvasExportModal` still previews and commits after the refactor.
- Manual: load grades on a Canvas-wired course; the column matches the modal's
  preview exactly.

## Out of scope

Auto-loading grades on course switch; snapshot-based staleness tracking; a local
`computeGrade` reimplementation; grades for courses without a Canvas config;
backfilling or correcting accumulated grades already pushed to Canvas under the old
behavior.
