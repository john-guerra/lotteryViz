# Drop the Grade-Type Selector, and Show the Canvas Grade on the Admin Table

**Date:** 2026-08-11
**Status:** Approved design

## Summary

**Phase 1 — delete the grade-type selector.** A Canvas export offers a choice between
a "lottery" and an "accumulated" grade. The choice is an illusion: `gradeType` picks
only the *destination assignment*, never the submitted value, so both options post the
same curved percentile grade. Rather than making the accumulated branch work, delete
it. The raw point total and the class median are already in the Canvas comment, which
is a better home for them than a bare gradebook column.

**Phase 2 — add a Grade column** to the Admin student table, sourced from the existing
export dry run rather than recomputed locally, so it shows what Canvas will actually
receive.

Phase 1 lands first so Phase 2 never encodes `gradeType` logic it would immediately
shed.

## Background

### The grade formula

`export-lottery-to-canvas.mjs:422` `computeGrade()` maps accumulated points to a
percentile/SD score: at the class median → 100, above → linear to 110, below →
quadratic penalty (1 SD → 78, 2 SD → 11, 3 SD → −100).

`medianAdjustment` shifts **the distribution, not the student**. `:668` builds
`adjustedPointsSorted` by subtracting the adjustment from every point total; `:684`
then grades each student's **raw** points against that shifted distribution. The
comment at `:681-683` explains why: shifting only `stats.median` would leave students
between the adjusted and raw medians below 100 despite clearing the effective
threshold. Any reimplementation must preserve this asymmetry.

The median is the upper-middle element `adjustedPointsSorted[floor(n/2)]` (`:676`) —
deliberately not `d3.median`, which averages the two middle values on even `n`.

### The selector does not select anything

`gradeType` appears at six places, and none touches a grade value:

| Line | Use |
|---|---|
| `:530` | option default |
| `:559-562` | which `assignmentId` to POST to |
| `:804` | assignment name, if one must be auto-created |
| `:826` | console hint naming which config key to update |
| `:1024` | CLI pass-through |

There is exactly one submission call, `:875-881`, and its value argument is
`student.grade` at **`:879`** — unconditional, outside any `gradeType` branch. The raw
tally `student.points` (`:641`) is only ever interpolated into the comment (`:868`)
and the log line (`:888`). `verifyGrades` checks `submittedGrades`, which also carries
`student.grade` (`:886`).

So `--grade-type accumulated` posts the curved grade to an assignment named "Lottery
Accumulated Points".

### The comment already carries what the second assignment was for

`:866-872` builds, for every submission:

```
🤖Lottery bot | Grade: 107.3

📊 12 calls, 18 pts total | 78.3th %ile (median: 9 pts [adjusted -2], 5 calls)
📐 Formula: median=100, above=linear to 110, below=quadratic SD curve
🗣️ Slack participation: 4 of 7 point-offer threads

📋 Point History:
  …
```

The student's own tally, the class median, the adjustment, the percentile, median
calls, the formula, and the full point history. `stats.medianCalls` is assigned at
`:766`, unconditionally, before the submit branch at `:783`.

The accumulated assignment was therefore never carrying information the comment
lacked — it was a bare, unlabelled duplicate. Deleting it loses nothing.

### Blast radius of the deletion

`accumulatedPointsAssignmentId` is non-null for two courses, both **archived** in
`canvas-config.json`. The active course has it `null`. So no live course is affected.

One archived course has `lotteryAssignmentId: null` *and* a non-null accumulated ID —
its curved grades live in a column named "Lottery Accumulated Points" and it has no
Lottery Grade assignment. It is finished; this is the one place the naming mismatch is
visible to students, and it is left alone.

### The dry run is the source of truth for Phase 2

`processCourse` grades against **Canvas enrollments**, not the local roster — enrolled
students with no lottery entries are folded in at 0 points (`:645-652`), moving the
median for everyone. It also fuzzy-matches lottery names to Canvas names
(`matchLotteryToCanvas:317`); students who fail to match receive no grade at all.

A local reimplementation could reproduce the arithmetic but neither of those. So
Phase 2 reads the dry run: `POST /api/canvas/export {dryRun: true}` → poll
`GET /api/canvas/export/:jobId` → `result`.

## Decisions

| Question | Decision |
|---|---|
| Grade-type selector | Removed — UI, API, and CLI |
| What an export sends | The curved grade, to `lotteryAssignmentId`, always |
| Raw points and median | Stay in the Canvas comment, unchanged |
| Second Canvas assignment | Not written, not created, not configured |
| Phase 2 grade source | The existing dry-run job, on demand |
| Course switch | Clear loaded grades back to idle |
| Staleness | Load refreshes table data first; timestamp caption |

`processCourse`'s **return shape is unchanged**. Top-level `submitted`, `errors`, and
`verification` stay where they are, so `CanvasExportModal.js:112-121` keeps working.

---

# Phase 1 — Delete the selector

Pure deletion. No new behavior.

## `export-lottery-to-canvas.mjs`

- `processCourse(courseName, { dryRun, verbose })` — drop the `gradeType` option
  (`:530`).
- `:559-562` — collapse to `assignmentId = lotteryAssignmentId`.
- `:804` — `assignmentName = "Lottery Grade"`.
- `:826` — the console hint names `lotteryAssignmentId` unconditionally.
- Stop destructuring `accumulatedPointsAssignmentId` (`:553`).
- `parseArgs` — remove `--grade-type` / `-g` (`:964`) and its usage text (`:974`).
  Passing the flag **errors with an explanatory message** rather than being silently
  ignored. Remove the pass-through at `:1024`.

`createLotteryAssignment`, `computeGrade`, the stats block, and the comment template
are untouched.

## `routes/canvas.js`

Drop `gradeType` from the request body (`:23`). The dedupe key becomes
`` `${course}:${dryRun ? "dry" : "live"}` `` (`:44`). This merges what were previously
two identical-work variants; the `dry`/`live` split that actually matters is untouched.

## `front/src/components/CanvasExportModal.js`

- Remove the `gradeType` prop (`:25`, `:214`) and its use in the title (`:98`).
- `:152-157` — the "no assignment configured" alert drops its `{gradeType}`
  interpolation.
- Keep the `assignmentId` prop; it still drives `:152-157`.
- **No table change.** `:159-180` already renders Grade (`:174`) and Pts (`:175`)
  alongside name and calls. Both numbers are already visible before writing.

## `front/src/pages/AdminPage.js`

- Remove the Grade type `<select>` (`:87-97`) and `gradeType` state (`:20`).
- `:58-61` — `assignmentId` collapses to `canvasConfig?.lotteryAssignmentId`.
- `exportTitle` loses its grade-type interpolation.

## Testing

`processCourse` is not directly testable today: the module imports `myDB` at load
(`:12`), opening a real Mongo connection, and calls global `fetch`. `jest.config.js`
is `transform: {}` node-ESM, so substitution needs `jest.unstable_mockModule` plus
dynamic-import restructuring. The existing suite only tests pure exported functions
because that is all that is reachable. **Phase 1 does not attempt to change that.**

What is testable and worth adding:

- A golden test for `computeGrade` over a fixed points array, pinning the median
  anchors (median → 100, top → 110, 1 SD → ~78, floor at −100) and the
  `medianAdjustment` shift semantics. Nothing currently pins this arithmetic.
- `parseArgs` rejects `--grade-type` with a non-zero exit and an explanatory message.

Manual verification: a dry run on the active course produces the same
`studentsWithGrades` before and after the change.

---

# Phase 2 — Grade column

## Section 1 — Extract the export job client

New `front/src/canvasExportJob.mjs`:

```js
// Starts a Canvas export job and polls it to completion.
// `promise` resolves with the job result, or rejects with an Error.
// `cancel()` stops polling so callers can abort on unmount.
runExportJob({ course, dryRun }) -> { promise, cancel }
```

It absorbs `startExport`, `POLL_MS` (`CanvasExportModal.js:9` — outside the function,
must move with it), and the polling loop (`:41-69`).

**It does not preserve the current error handling, which is broken.** `:48-51` never
checks `res.ok`. `GET /api/canvas/export/:jobId` 404s with `{error: "job not found"}`
whenever the store has no entry — which happens on every backend restart, and nodemon
restarts on every file save. The parsed body has no `status`, so it is not
`"running"`, not `"error"`, and `job.result?.success === false` is false. It falls to
the else branch and resolves as **success with `result: undefined`**. In the modal
that renders an empty preview; in Phase 2 it would throw inside the promise handler
and strand the Load button in `loading` forever.

`runExportJob` therefore rejects on:

- `!res.ok` on either the POST or any poll GET
- a `job.status` that is not `running`, `error`, or `done`
- a resolved job whose `result` is `undefined`
- exceeding a poll deadline (2 minutes)

and otherwise keeps the existing precedence: `job.status === "error"` → `job.error`;
then `job.result?.success === false` → `job.result.error`; else resolve `job.result`.

`CanvasExportModal` is refactored onto it — its `phase` state machine stays in the
component, only the transport moves.

## Section 2 — AdminPage state

```js
const [canvasGrades, setCanvasGrades] = useState(null);   // { byName, unmatched, loadedAt }
const [gradesStatus, setGradesStatus] = useState("idle");  // idle|loading|ready|error
const [gradesError, setGradesError] = useState(null);
```

A **Load Canvas grades** button sits beside Export, disabled when `!canvasConfig` or
while loading.

**Load calls `refreshData()` first and awaits it.** This is not optional. `refreshData`
reads Mongo at page load (T0); the dry run re-reads Mongo server-side at click time
(T1) via `getLotteryCounts` (`:573`). Without the refresh, Grade is computed from a
*newer* dataset than every other column — so an instructor running the lottery in
another window sees `Points: 12` beside a grade computed from 14. Refreshing first
makes both columns read the same snapshot.

On success the result is reduced to:

- `byName` — `Object.fromEntries(studentsWithGrades.filter(s => s.lotteryName).map(s => [s.lotteryName, s.grade]))`
- `unmatched` — `new Set(unmatchedLottery.map(u => u.name))`
- `loadedAt` — capture time for the caption

### The join key

`studentsWithGrades[].lotteryName` and `unmatchedLottery[].name` are both the Mongo
aggregation `_id` from `$group: {_id: "$name"}` (`db/myDB.js:147-159`), the same string
`StudentTable.js:58` keys rows by. Strings match exactly; no matching logic needed.

The two populations are **not identical**, and the spec does not pretend otherwise:
`routes/index.js:103-107` filters `getCounts` by `classes[course].roster` when
`FILTER_BY_REGISTERED` (`:13`, currently `true`), while the export's
`getLotteryCounts` (`:174-184`) is always unfiltered. So the export's population is a
superset, and `unmatched` may contain names with no table row. Harmless — those names
simply never render. If `FILTER_BY_REGISTERED` were ever flipped to `false`, the two
populations converge; nothing here depends on which way it is set.

### Clearing

A `useEffect` keyed on `[course]` resets `canvasGrades` to `null` and `gradesStatus`
to `"idle"`, cancelling any in-flight job via `cancel()` so a slow response for the
previous course cannot land on the new one. With `gradeType` gone, course is the only
trigger.

### Caption

When `gradesStatus === "ready"`: `Canvas grades loaded 14:32` with a **Reload** button.
On `"error"`, the error text and a Retry button. The caption says *loaded*, not
*current* — the live export recomputes, and Canvas-side enrollment changes move the
median for everyone.

## Section 3 — The Grade column

`StudentTable` gains three props, all optional with safe defaults, all with
`propTypes`:

| Prop | Type | Passed as |
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
| has a grade | e.g. `107.3`, tinted (see below) |
| in `unmatchedNames` | `⚠` amber, `title="No Canvas match — will not be graded"` |
| `ready` but absent | `–`, muted |

### Color domain

Tinting reuses `getCellColor(value, median, extent)` with `median = 100` and a
**fixed** `extent` of `[60, 110]`, with values clamped into that range first.

The extent must not be derived from the data. `getCellColor` (`:94-111`) normalizes
the below-median half across `[min, median]`; with real grades spanning `[-100, 110]`,
a student at 78 — a full SD below, a genuine penalty — maps to
`0.5 × 178/200 = 0.445`, essentially white, while the entire above-median population
is compressed into `100→110` and gets the whole blue half. The column would read
"nobody is struggling" on the same row where Points reads the opposite. With the fixed
domain, 78 maps to `0.5 × 18/40 = 0.225` — clearly red.

### Sorting

`"grade"` joins the numeric branch at `:120`, with a two-level comparator:

```js
rank(a) - rank(b) || directionalCompare(a, b)
```

`rank` is 0 for a graded row and 1 otherwise, applied **outside** the direction flip
so ungraded rows sort last in both directions — inside the existing comparator
(`:115-131`), which negates the whole comparison, it would break in one direction.

Ties are the common case, not an edge case: `computeGrade` returns *exactly* 100 for
every student at the median (`:428-430`), and the median is a modal point value. The
tiebreaker is points descending, then name.

Anonymize is unaffected — it governs only the Name cell.

## Testing

- `runExportJob`: resolves on success; rejects on a 404 poll response; rejects on
  unknown `job.status`; rejects on `result: undefined`; surfaces `job.error` and
  `job.result.error`; stops polling after `cancel()`; honors the deadline.
- `StudentTable` renders each of the five row states.
- Sorting: ungraded rows last **in both directions**, and a block of tied grades
  ordered by points descending then name.
- `getCellColor` with the fixed domain returns a visibly red tint at 78 and a blue one
  at 107.
- Regression: `CanvasExportModal` still previews and commits after the refactor.
- Manual: Load on the active course; the column matches the modal's preview exactly.

## Known limitations — documented, not built

Each is real, each has a fix, none blocks this work.

1. **Zero-point students are invisible.** `byName` drops entries from
   `noLotteryEntries` (`:645-652`) — enrolled students with no lottery entries, graded
   at 0, who pull the median down for everyone. The table shows only students with
   entries and gives no signal that others are being graded. *Fix:* report
   `stats.total` versus table row count in the caption.
2. **Displaced matches get a misleading tooltip.** `unmatchedLottery` entries carry
   `displaced: true` when they matched at ≥70% confidence but lost the claim — usually
   two roster spellings of one person. `"No Canvas match"` is wrong for those. *Fix:*
   distinguish the two in the `title`. Related: `ties` and `noLotteryEntries` are
   computed (`:408`) and discarded by `processCourse`'s return (`:927-936`).
3. **Missing `CANVAS_TOKEN` fails late.** `routes/canvas.js:31-40` checks the token
   only when `!dryRun`, so a dry run 200s with a jobId and then errors a poll cycle
   later from inside `getCanvasEnrollments`. *Fix:* hoist the check, or add a health
   endpoint so the button can be disabled with an explanatory `title`.
4. **`job-store.mjs:25` never prunes the `jobs` Map** — only `inFlightByKey` is
   deleted. Phase 2 makes dry runs a routine click, and each retained job holds a full
   `studentsWithGrades` array. *Fix:* LRU cap or TTL.
5. **A live export does not invalidate the column.** Confirm an export in the modal and
   the column keeps showing the pre-export snapshot under a now-doubly-stale caption.
   *Fix:* clear or reload `canvasGrades` when the modal reaches `done`.
6. **Dedupe is per-process and in-memory.** A CLI export and a server-triggered export
   can run concurrently against the same assignment with no lock; interleaved PUTs mean
   per-student last-writer-wins across two snapshots. Accepted for a single-user tool.

`submitGrade` is a `PUT` of `posted_grade` and is therefore idempotent — a partial
failure is repaired by re-running the export. That is the coherence guarantee.

## Out of scope

Auto-loading grades on course switch; a local `computeGrade` reimplementation; grades
for courses without a Canvas config; deleting or unpublishing the archived accumulated
assignments in Canvas; and the two pre-existing export bugs filed as
[#5](https://github.com/john-guerra/lotteryViz/issues/5) (`--all` skips active courses)
and [#6](https://github.com/john-guerra/lotteryViz/issues/6) (name-based assignment
resolution with no write-back).
