# Canvas Export UI, Shared Course Selection, and Instructor-Scoped Slack Scan

**Date:** 2026-08-04
**Status:** Approved design

## Summary

Three related changes to the lottery app:

1. **Course registry** — make `front/src/students.mjs` the single source of truth for
   which courses exist and what each one is wired up to.
2. **Shared course selection** — one course selector shared by Main, Admin, and
   Participation, persisted across navigation and reloads.
3. **Canvas export UI** — export lottery grades to Canvas from the Admin page,
   behind a preview-then-confirm modal.

A fourth, one-line change rides along: scope the Slack scanner to the instructor's
own posts.

## Background

The course key is a MongoDB database name. Each course lives in its own database,
`lottery_<course>` — 32 of them today, roughly 7,000 grade documents spanning
2021 through 2026. Keys are therefore immutable: renaming one orphans a database.

Three files list courses, each a different subset of one consistent key space:

| Source | Keys | Meaning |
|---|---|---|
| `front/src/students.mjs` | `webdev_summer_2026`, `lottery_tests`, `ikono_ai_coding` | courses currently being taught (have a roster) |
| `canvas-config.json` | `aicoding_spring_2026`, `db_spring_2026`, `webdev_spring_2026`, `webdev_summer_2026` | courses with Canvas assignment IDs |
| MongoDB | 32 databases | full archive |

Every key that appears in more than one place is spelled identically. There is no
conflict to resolve and nothing to rename.

`students.mjs` is already the de-facto shared registry — `routes/index.js:15`,
`slack-checker/matcher.mjs:1`, and `export-lottery-to-canvas.mjs:13` all import
`classes` from it. `getAvailableCourses()` (`matcher.mjs:23-25`) is literally
`Object.keys(classes)`.

All three config files (`students.mjs`, `canvas-config.json`,
`slack-checker/config.json`) are gitignored.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Registry scope | Active courses only | The UI should offer what you're teaching now; archived semesters stay reachable from the CLI. |
| Source of truth | `students.mjs` | Already imported by every backend consumer. |
| Canvas IDs | Move into `students.mjs`; archive the rest | One course = one entry. Ends the split where `medianAdjustment` and Canvas IDs live in different files. |
| Export UI | Admin page + preview modal | Keeps export beside the grades it acts on; reuses the participation preview pattern. |
| Persistence | React Context + `localStorage` | Survives both navigation and reload. |

## Section 1 — Course registry

`students.mjs` is gitignored, so it holds **data only, never logic**. Code added
there would not be version-controlled and a fresh clone would break.

### `front/src/students.mjs` (gitignored, data)

Active courses gain a `canvas` block:

```js
webdev_summer_2026: {
  roster: [...],
  medianAdjustment: 0,
  canvas: {
    courseId,
    lotteryAssignmentId,
    accumulatedPointsAssignmentId,
    participationGroupId,
  },
}
```

`lottery_tests` and `ikono_ai_coding` stay as they are. The absence of a `canvas`
key *is* the capability signal — no parallel list of flags to drift out of sync.

Values are seeded from the current `canvas-config.json` entry for
`webdev_summer_2026`.

### `front/src/courses.mjs` (new, tracked, logic)

```js
import { classes } from "./students.mjs";

export function listCourses()          // [{ key, hasCanvas }]
export function getCanvasConfig(key)   // classes[key].canvas ?? null
```

This module reads **only** `students.mjs`. It must not import `canvas-config.json`:
`courses.mjs` lives in `front/src/`, and Create React App's `ModuleScopePlugin`
rejects imports from outside `src/`, so a root-level import would break the build.

The archive fallback therefore lives on the backend, in
`export-lottery-to-canvas.mjs`, which already reads `canvas-config.json` at
line 51-52. It resolves `classes[course].canvas` first, then the archived entry —
so the CLI keeps working for past semesters while the frontend only ever needs the
active data it can actually see.

### `canvas-config.json`

Shrinks to archived semesters only: `aicoding_spring_2026`, `db_spring_2026`,
`webdev_spring_2026`. The `webdev_summer_2026` entry moves into `students.mjs`.

`node export-lottery-to-canvas.mjs --course db_spring_2026` continues to work.

## Section 2 — Shared course selection

### `front/src/context/CourseContext.js` (new)

Modeled on `SelectionContext`, but mounted differently. `SelectionProvider` sits
*inside* `AdminPage.js:51` because brushed-student selection is page-local and
should reset on navigation. Course selection is the opposite, so `CourseProvider`
mounts in `App.js` above `<Routes>`:

```js
const App = () => (
  <div className="App">
    <CourseProvider>
      <NavBar />
      <Routes>…</Routes>
    </CourseProvider>
  </div>
);
```

Exposes `{ course, setCourse, courses }`. Seeds from `localStorage` key
`lottery.course` on first render; writes back on change.

**Stale-key validation is required.** The course list turns over every semester, so
a stored value will outlive the entry it names. If the stored key is not in
`listCourses()`, fall back to the first available course.

### Call-site changes

- **`AdminPage.js:9`** — drop local `useState`, read `useCourse()`. Already has
  `value={course}`.
- **`MainPage.js:17,161`** — drop local `useState`, read `useCourse()`, and add the
  missing `value={course}` to the `<select>`. It is currently uncontrolled; a
  restored selection would set state without moving the dropdown.
- **`ParticipationPage.js:98-134`** — drop the `courses` fetch and the `""` initial
  state. The page currently starts with no course, fires effects that early-return
  on `if (!course)`, then re-runs after the fetch resolves. Context makes the course
  correct on first render.

`/api/participation/courses` (`routes/participation.js:57-59`) stays as an API
surface; it simply stops being the page's source.

## Section 3 — Canvas export API

### `routes/canvas.js` (new), mounted at `/api/canvas`

```
POST /api/canvas/export      { course, gradeType, dryRun }  → { jobId }
GET  /api/canvas/export/:id                                 → { status, result | error }
```

A live export is slow: `processCourse` does paginated enrollment fetches plus one
`submitGrade` call per student, then a verification pass — 25+ sequential Canvas
round trips for a 24-student course. This copies the job structure from
`routes/participation.js:50-103`:

- in-memory `Map` of jobs, `jobId → { status, course, result?, error? }`
- `inFlightByCourse` guard so a double-click cannot launch two exports
- `localhostOnly` on the live run; the dry run is unguarded, matching how
  `/preview` is open while `/award` is guarded (`participation.js:117,136`)

### Changes to `export-lottery-to-canvas.mjs`

1. Add `processCourse` to the exports at line 1019 — currently module-private.
2. Widen its return value. `submitted`, `errors`, and the verification results are
   local variables that only reach `console.log`; the modal needs them. They join
   the returned object alongside the existing `stats`, `studentsWithGrades`, and
   `unmatchedLottery`.

The grading math does not move. The CLI is unchanged.

### Confirm re-runs the export

The dry run and the live run are two independent `processCourse` calls. This costs
a second enrollment fetch but means grades are computed from the database as it
stands at submit time — a stale preview cannot silently write old grades.

### Error handling

Follows the existing 503-for-missing-credential convention
(`participation.js:43-47,73`):

| Condition | Response |
|---|---|
| `CANVAS_TOKEN` unset | `503` — "CANVAS_TOKEN is not set — add it to .env" |
| Course has no `canvas` block | `400` — course is not wired for Canvas |
| Canvas API failure mid-run | job → `status: "error"`, message surfaced in modal |
| Some students fail | job → `done`, with `errors` count shown |

Per-student failures already do not abort the run
(`export-lottery-to-canvas.mjs:865-872` catches and counts), so a partial export
reports honestly.

## Section 4 — Export modal and Admin page

### `front/src/components/CanvasExportModal.js` (new)

Follows `ParticipationPreviewModal`: Bootstrap `modal show d-block`, inline
backdrop, backdrop-click to cancel (suppressed while committing), full `propTypes`.
Hand-rolled — no `bootstrap.bundle.js` modal manager.

State machine over the poll result:

```
running    → spinner, "Computing grades…"
preview    → stats header, unmatched warning, matched table, [Cancel] [Submit to Canvas]
committing → spinner, cancel disabled
done       → "Submitted 24, 0 errors, verified 24/24"
error      → message, [Close]
```

**The unmatched section renders above the grade table.** Name matching runs at
`MIN_CONFIDENCE = 70` (`export-lottery-to-canvas.mjs:229`); an unmatched student is
a lottery participant about to silently receive no Canvas grade. In the CLI this
scrolls past. It does not block submitting — it informs.

### `AdminPage.js`

- Grade-type toggle: `lottery` / `accumulated`, matching the CLI's `--grade-type`.
- "Export to Canvas" button, disabled with an explanatory `title` when the selected
  course has no `canvas` block (today: `lottery_tests`, `ikono_ai_coding`).

## Section 5 — Instructor-scoped Slack scan

`scan.mjs:53-55` already filters channel history by author:

```js
const filtered = cfg.instructorSlackId
  ? history.filter((m) => m.user === cfg.instructorSlackId)
  : history;
```

`slack-checker/config.json` has `"instructorSlackId": ""` for `webdev_summer_2026`,
so the filter is skipped and every author's posts are scanned. Set it to
`U09D5U3USNR` (looked up via `users.list`: `john.guerra`, "John Alexis Guerra
Gomez", non-bot, active).

This remains a per-course config value — no code change.

## Testing

Extending `__tests__/canvas-matching.test.mjs`'s pure-function style rather than
introducing HTTP-level testing:

- `courses.mjs` — `listCourses()` capability flags; `getCanvasConfig()` returning
  `null` for a course with no `canvas` block
- `export-lottery-to-canvas.mjs` — course config resolves active-then-archived
- `CourseContext` — a stale stored key falls back to the first course
  (the semester-rollover case)
- job store — `inFlightByCourse` dedupe returns the existing `jobId`

Not mocking the Canvas API for `processCourse`: the grading math is unchanged and
already covered, and the dry-run path is itself the safe manual test.

## Out of scope

- Renaming or migrating any course key or MongoDB database
- Exposing archived semesters in the UI (CLI only)
- Reworking the grading formula or name-matching thresholds
- Surfacing `canvas-export-log.txt` history in the UI
