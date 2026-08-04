# Canvas Export UI and Shared Course Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export lottery grades to Canvas from the Admin page behind a preview-then-confirm modal, share one persisted course selection across all pages, and scope the Slack scanner to the instructor's own posts.

**Architecture:** `front/src/students.mjs` becomes the course registry (data only — it is gitignored, so all derivation logic lives in a new tracked `front/src/courses.mjs`). A `CourseContext` mounted above `<Routes>` holds the selection and mirrors it to `localStorage`. Canvas export reuses the background-job pattern from `routes/participation.js`: POST starts a job, the client polls, and a dry run renders a preview that a confirm step re-runs live.

**Tech Stack:** Node 20 ESM, Express 4, React 18 (Create React App), React Router 6, Bootstrap 4 classes, Jest (`node` environment, `.mjs` only), MongoDB (database-per-course).

## Global Constraints

- Course keys are MongoDB database names (`lottery_<course>`). Never rename or migrate one.
- `front/src/students.mjs`, `canvas-config.json`, and `slack-checker/config.json` are gitignored. Never `git add` them. Data goes in them; logic never does.
- `front/src/courses.mjs` must not import `canvas-config.json`. CRA's `ModuleScopePlugin` rejects imports from outside `front/src/`.
- Jest is `testEnvironment: 'node'` and matches only `**/__tests__/**/*.mjs` and `**/*.test.mjs`. All new tests are `.mjs` pure-function tests. Do not add React component tests to this runner.
- Test assertions must not depend on the real contents of `students.mjs` — pass fixture data into pure functions instead.
- Run tests with `yarn test`.
- Follow the existing 503-for-missing-credential convention from `routes/participation.js:43-47`.
- New React components get a full `propTypes` block (see `ParticipationPreviewModal.js:102-110`).

---

### Task 1: Scope the Slack scanner to the instructor

**Files:**
- Modify: `slack-checker/config.json` (gitignored — do not commit)

**Interfaces:**
- Consumes: nothing
- Produces: nothing — `scan.mjs:53-55` already reads this key

`scan.mjs` already filters channel history by author when `cfg.instructorSlackId` is
truthy. The key exists but is `""`, so the filter is skipped today.

- [ ] **Step 1: Set the instructor Slack ID**

In `slack-checker/config.json`, under the `webdev_summer_2026` course entry:

```diff
-    "instructorSlackId": "",
+    "instructorSlackId": "U09D5U3USNR",
```

`U09D5U3USNR` is `john.guerra` / "John Alexis Guerra Gomez", resolved via
`users.list`. Non-bot, active.

- [ ] **Step 2: Verify the filter is live**

Run:

```bash
node --input-type=module -e "
import { loadScanConfig } from './slack-checker/config.js';
const c = loadScanConfig('webdev_summer_2026');
console.log('instructorSlackId:', JSON.stringify(c.instructorSlackId));
"
```

Expected: `instructorSlackId: "U09D5U3USNR"`

- [ ] **Step 3: No commit**

`slack-checker/config.json` is gitignored. Nothing to commit for this task.

---

### Task 2: Course registry module

**Files:**
- Create: `front/src/courses.mjs`
- Create: `__tests__/courses.test.mjs`
- Modify: `front/src/students.mjs` (gitignored — do not commit)
- Modify: `canvas-config.json` (gitignored — do not commit)

**Interfaces:**
- Consumes: `classes` from `front/src/students.mjs`
- Produces:
  - `resolveCourseKey(storedKey: string|null, availableKeys: string[]): string` — pure
  - `listCourses(): Array<{key: string, hasCanvas: boolean}>`
  - `getCanvasConfig(key: string): object|null`
  - `COURSE_STORAGE_KEY: string` — `"lottery.course"`

- [ ] **Step 1: Write the failing test**

Create `__tests__/courses.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test __tests__/courses.test.mjs`
Expected: FAIL — cannot find module `../front/src/courses.mjs`

- [ ] **Step 3: Write the implementation**

Create `front/src/courses.mjs`:

```js
// Course registry. students.mjs is gitignored and holds DATA ONLY; this tracked
// module holds the logic that derives the course list from it. Frontend-safe:
// it must never import canvas-config.json, which lives outside front/src/ and
// would be rejected by CRA's ModuleScopePlugin.
import { classes } from "./students.mjs";

export const COURSE_STORAGE_KEY = "lottery.course";

/**
 * Pick a valid course key. The course list turns over every semester, so a
 * persisted key routinely outlives the entry it names.
 */
export function resolveCourseKey(storedKey, availableKeys) {
  if (storedKey && availableKeys.includes(storedKey)) return storedKey;
  return availableKeys[0] ?? "";
}

/** Capability-by-presence: a `canvas` block IS the "wired for Canvas" signal. */
export function buildCourseList(courseMap) {
  return Object.keys(courseMap).map((key) => ({
    key,
    hasCanvas: Boolean(courseMap[key].canvas),
  }));
}

export function listCourses() {
  return buildCourseList(classes);
}

export function getCanvasConfig(key) {
  return classes[key]?.canvas ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test __tests__/courses.test.mjs`
Expected: PASS — 6 tests

- [ ] **Step 5: Move the Canvas IDs into students.mjs**

In `front/src/students.mjs`, add a `canvas` block to the `webdev_summer_2026` entry,
alongside its existing `roster` and `medianAdjustment` keys. Use the exact values
currently in `canvas-config.json`:

```js
  webdev_summer_2026: {
    roster: [ /* unchanged */ ],
    medianAdjustment: 0,          // keep whatever value is already there
    canvas: {
      courseId: 249954,
      lotteryAssignmentId: 3196231,
      accumulatedPointsAssignmentId: null,
      participationGroupId: 664838,
    },
  },
```

Leave `lottery_tests` and `ikono_ai_coding` untouched — no `canvas` key is how they
signal "not wired for Canvas".

- [ ] **Step 6: Trim canvas-config.json to archived semesters**

Delete the `webdev_summer_2026` entry from `canvas-config.json`, leaving only
`aicoding_spring_2026`, `db_spring_2026`, and `webdev_spring_2026`.

- [ ] **Step 7: Verify the registry reads the new data**

Run:

```bash
node --input-type=module -e "
import { listCourses, getCanvasConfig } from './front/src/courses.mjs';
console.log(JSON.stringify(listCourses()));
console.log('canvas:', JSON.stringify(getCanvasConfig('webdev_summer_2026')));
console.log('no canvas:', JSON.stringify(getCanvasConfig('lottery_tests')));
"
```

Expected: `webdev_summer_2026` has `hasCanvas: true`, the other two `false`;
`getCanvasConfig("webdev_summer_2026")` returns the four IDs;
`getCanvasConfig("lottery_tests")` returns `null`.

- [ ] **Step 8: Commit**

```bash
git add front/src/courses.mjs __tests__/courses.test.mjs
git commit -m "feat(courses): add tracked course registry over students.mjs

students.mjs is gitignored and now holds per-course canvas config as data;
this module derives the course list and resolves persisted keys that
outlive a semester rollover."
```

---

### Task 3: Shared course selection

**Files:**
- Create: `front/src/context/CourseContext.js`
- Modify: `front/src/App.js`
- Modify: `front/src/pages/AdminPage.js:1-9,32-34,63`
- Modify: `front/src/pages/MainPage.js:17-18,150-166`
- Modify: `front/src/pages/ParticipationPage.js:97-134,371-380`

**Interfaces:**
- Consumes: `listCourses`, `resolveCourseKey`, `COURSE_STORAGE_KEY` from `front/src/courses.mjs`
- Produces: `useCourse(): { course: string, setCourse: (key: string) => void, courses: Array<{key, hasCanvas}> }`

- [ ] **Step 1: Create the provider**

Create `front/src/context/CourseContext.js`:

```js
import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import { listCourses, resolveCourseKey, COURSE_STORAGE_KEY } from "../courses.mjs";

const CourseContext = createContext(null);

// Unlike SelectionProvider (mounted inside AdminPage so brushed selection resets
// on navigation), this mounts above <Routes> so the course survives page moves,
// and mirrors to localStorage so it survives reloads.
export function CourseProvider({ children }) {
  const courses = useMemo(() => listCourses(), []);
  const keys = useMemo(() => courses.map((c) => c.key), [courses]);

  const [course, setCourse] = useState(() => {
    let stored = null;
    try {
      stored = window.localStorage.getItem(COURSE_STORAGE_KEY);
    } catch {
      // Private browsing / storage disabled — fall through to the default.
    }
    return resolveCourseKey(stored, keys);
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(COURSE_STORAGE_KEY, course);
    } catch {
      // Non-fatal: the selection just won't survive a reload.
    }
  }, [course]);

  const value = useMemo(() => ({ course, setCourse, courses }), [course, courses]);

  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>;
}

CourseProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useCourse() {
  const context = useContext(CourseContext);
  if (!context) {
    throw new Error("useCourse must be used within a CourseProvider");
  }
  return context;
}
```

- [ ] **Step 2: Mount it in App.js**

Replace the body of `front/src/App.js`:

```js
import React from "react";
import { Routes, Route } from "react-router-dom";
import { CourseProvider } from "./context/CourseContext";
import NavBar from "./components/NavBar";
import MainPage from "./pages/MainPage";
import AdminPage from "./pages/AdminPage";
import ParticipationPage from "./pages/ParticipationPage";
import "./App.css";

const App = () => (
  <div className="App">
    <CourseProvider>
      <NavBar />
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/participation" element={<ParticipationPage />} />
      </Routes>
    </CourseProvider>
  </div>
);

export default App;
```

- [ ] **Step 3: Wire AdminPage**

In `front/src/pages/AdminPage.js`, add the import:

```js
import { useCourse } from "../context/CourseContext";
```

Replace line 9:

```diff
-  const [course, setCourse] = useState(Object.keys(classes)[0]);
+  const { course, setCourse, courses } = useCourse();
```

Replace the `onChangeCourse` handler at lines 32-34 body and the option list at
line 63:

```diff
-              {Object.keys(classes).map((c) => (
-                <option value={c} key={c}>
-                  {c}
-                </option>
+              {courses.map((c) => (
+                <option value={c.key} key={c.key}>
+                  {c.key}
+                </option>
               ))}
```

Keep the `classes` import — lines 111-112 still read `classes[course].roster` and
`classes[course].medianAdjustment`.

- [ ] **Step 4: Wire MainPage**

In `front/src/pages/MainPage.js`, add the import:

```js
import { useCourse } from "../context/CourseContext";
```

Replace lines 17-18. `options` becomes derived rather than a second state that has
to be kept in sync by hand:

```diff
-  const [course, setCourse] = useState(Object.keys(classes)[0]);
-  const [options, setOptions] = useState(classes[course].roster);
+  const { course, setCourse, courses } = useCourse();
+  const options = classes[course].roster;
```

Replace `onChangeCourse` (lines 150-154):

```diff
   const onChangeCourse = (evt) => {
-    console.log("course", evt.target.value);
     setCourse(evt.target.value);
-    setOptions(classes[evt.target.value].roster);
   };
```

Replace the `<select>` (line 161). Note the added `value` — it is currently
uncontrolled, so a restored selection would set state without moving the dropdown:

```diff
-          <select className="form-control" name="course" onChange={onChangeCourse}>
-            {Object.keys(classes).map((c) => (
-              <option value={c} key={c}>
-                {c}
-              </option>
+          <select
+            className="form-control"
+            name="course"
+            value={course}
+            onChange={onChangeCourse}
+          >
+            {courses.map((c) => (
+              <option value={c.key} key={c.key}>
+                {c.key}
+              </option>
             ))}
```

Remove any now-unused `setOptions` references elsewhere in the file (search for
`setOptions`).

- [ ] **Step 5: Wire ParticipationPage**

In `front/src/pages/ParticipationPage.js`, add the import:

```js
import { useCourse } from "../context/CourseContext";
```

Replace lines 98-99:

```diff
-  const [courses, setCourses] = useState([]);
-  const [course, setCourse] = useState("");
+  const { course, setCourse, courses } = useCourse();
```

Delete the courses-fetch effect entirely (lines 127-135):

```diff
-  useEffect(() => {
-    fetch("/api/participation/courses")
-      .then((r) => r.json())
-      .then((data) => {
-        setCourses(data.courses || []);
-        setCourse((prev) => prev || data.courses?.[0] || "");
-      })
-      .catch(() => setCourses([]));
-  }, []);
```

Update the `<select>` option list (lines 377-379):

```diff
-            {courses.map((c) => (
-              <option key={c} value={c}>
-                {c}
-              </option>
+            {courses.map((c) => (
+              <option key={c.key} value={c.key}>
+                {c.key}
+              </option>
             ))}
```

- [ ] **Step 6: Build and verify persistence by hand**

Run:

```bash
cd front && yarn build
```

Expected: build succeeds with no `ModuleScopePlugin` or unused-variable errors.

Then start the server (`yarn dev`) and check at `http://localhost:4001`:
1. On `/`, pick a non-default course.
2. Navigate to `/admin` — the same course is selected.
3. Navigate to `/participation` — same course, and it loads posts immediately
   rather than starting blank.
4. Reload the page — the course is still selected.

- [ ] **Step 7: Commit**

```bash
git add front/src/context/CourseContext.js front/src/App.js \
        front/src/pages/AdminPage.js front/src/pages/MainPage.js \
        front/src/pages/ParticipationPage.js
git commit -m "feat(courses): share course selection across pages via CourseContext

Mounted above <Routes> so the selection survives navigation, mirrored to
localStorage so it survives reloads. Also fixes MainPage's uncontrolled
course <select> and drops ParticipationPage's redundant courses fetch."
```

---

### Task 4: Make the exporter callable in-process

**Files:**
- Modify: `export-lottery-to-canvas.mjs:51-52,513-530,820-905,1019`
- Create: `__tests__/course-config.test.mjs`

**Interfaces:**
- Consumes: `getCanvasConfig` from `front/src/courses.mjs`
- Produces:
  - `resolveCourseConfig(course: string, activeMap: object, archive: object): object|null`
  - `processCourse(courseName: string, options: {dryRun?, verbose?, gradeType?}): Promise<{success, courseName, stats, studentsWithGrades, unmatchedLottery, submitted, errors, verification}>`

- [ ] **Step 1: Write the failing test**

Create `__tests__/course-config.test.mjs`:

```js
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
```

Note the archived shape uses `canvasId` while the active shape uses `courseId`;
`resolveCourseConfig` normalizes both to `courseId`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test __tests__/course-config.test.mjs`
Expected: FAIL — `resolveCourseConfig is not a function`

- [ ] **Step 3: Add the resolver**

In `export-lottery-to-canvas.mjs`, near the config load at lines 51-52, add:

```js
/**
 * Resolve a course's Canvas wiring. Active courses carry it in students.mjs;
 * finished semesters keep theirs in canvas-config.json so the CLI can still
 * re-export them. Normalizes the archived `canvasId` to `courseId`.
 */
export function resolveCourseConfig(course, activeMap = classes, archive = config.courses) {
  const active = activeMap?.[course]?.canvas;
  if (active) return active;

  const archived = archive?.[course];
  if (!archived) return null;

  const { canvasId, ...rest } = archived;
  return { courseId: canvasId, ...rest };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test __tests__/course-config.test.mjs`
Expected: PASS — 4 tests

- [ ] **Step 5: Use the resolver in processCourse**

In `processCourse` (starting line 513), replace the config lookup:

```diff
-  const courseConfig = config.courses[courseName];
-  if (!courseConfig) {
+  const courseConfig = resolveCourseConfig(courseName);
+  if (!courseConfig) {
     console.error(`Course "${courseName}" not found in config.`);
-    console.log("Available courses:", Object.keys(config.courses).join(", "));
+    console.log("Available courses:", [
+      ...Object.keys(classes).filter((k) => classes[k].canvas),
+      ...Object.keys(config.courses),
+    ].join(", "));
     return { success: false, error: "Course not found" };
   }

-  const { canvasId, lotteryAssignmentId, accumulatedPointsAssignmentId, participationGroupId } =
-    courseConfig;
+  const { courseId: canvasId, lotteryAssignmentId, accumulatedPointsAssignmentId,
+          participationGroupId } = courseConfig;
```

Add a guard immediately after `assignmentId` is chosen (around line 537), so the
`accumulated` type fails clearly instead of submitting to `null`:

```js
  if (!assignmentId) {
    return {
      success: false,
      courseName,
      error: `No ${gradeType} assignment configured for ${courseName}.`,
    };
  }
```

- [ ] **Step 6: Widen the return value**

`submitted`, `errors`, and the verification result are currently local variables
that only reach `console.log`. Hoist `verification` so it is visible at the return.

Declare near the other counters (before the `if (!dryRun)` block around line 820):

```js
  let verification = null;
```

Change the verification call (around line 878) from `const verification = ...` to
an assignment:

```diff
-      const verification = await verifyGrades(canvasId, assignmentId, submittedGrades);
+      verification = await verifyGrades(canvasId, assignmentId, submittedGrades);
```

Then replace the return statement at the end of `processCourse`:

```diff
   return {
     success: true,
     courseName,
     stats,
     studentsWithGrades,
     unmatchedLottery,
+    submitted,
+    errors,
+    verification,
   };
```

If `submitted` and `errors` are declared inside the `if (!dryRun)` block, hoist
their declarations above it and initialize both to `0` so a dry run returns zeros
rather than throwing a ReferenceError.

- [ ] **Step 7: Export processCourse**

Replace line 1019:

```diff
-export { MIN_CONFIDENCE, parseNameParts, scoreNameMatch, matchLotteryToCanvas };
+export { MIN_CONFIDENCE, parseNameParts, scoreNameMatch, matchLotteryToCanvas, processCourse };
```

- [ ] **Step 8: Verify the CLI still works end to end**

Run:

```bash
node export-lottery-to-canvas.mjs --course webdev_summer_2026 --dry-run
```

Expected: completes with a grade table and `[DRY RUN] No grades submitted.` — proves
the resolver found the config now living in `students.mjs`.

Run:

```bash
node export-lottery-to-canvas.mjs --course db_spring_2026 --dry-run
```

Expected: also completes — proves the archived fallback still resolves.

Run: `yarn test`
Expected: all suites pass, including the pre-existing `canvas-matching.test.mjs`.

- [ ] **Step 9: Commit**

```bash
git add export-lottery-to-canvas.mjs __tests__/course-config.test.mjs
git commit -m "feat(canvas): export processCourse and resolve course config

Canvas wiring for active courses now lives in students.mjs, with
canvas-config.json kept as the archive for finished semesters. processCourse
is exported and returns submitted/errors/verification so an HTTP caller can
report the outcome."
```

---

### Task 5: Canvas export job API

**Files:**
- Create: `routes/job-store.mjs`
- Create: `routes/canvas.js`
- Create: `__tests__/job-store.test.mjs`
- Modify: `app.js:9,27`

**Interfaces:**
- Consumes: `processCourse`, `resolveCourseConfig` from `export-lottery-to-canvas.mjs`
- Produces:
  - `createJobStore(): { start(key, runner): {jobId, reused}, get(jobId): object|undefined }`
  - `POST /api/canvas/export` → `{ jobId, reused? }`
  - `GET /api/canvas/export/:jobId` → `{ status: "running"|"done"|"error", course, result?, error? }`

- [ ] **Step 1: Write the failing test**

Create `__tests__/job-store.test.mjs`:

```js
import { createJobStore } from "../routes/job-store.mjs";

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("createJobStore", () => {
  test("records a completed job result", async () => {
    const store = createJobStore();
    const { jobId } = store.start("webdev_summer_2026", async () => ({ submitted: 3 }));
    expect(store.get(jobId).status).toBe("running");
    await flush();
    expect(store.get(jobId)).toMatchObject({ status: "done", result: { submitted: 3 } });
  });

  test("records a failed job as error", async () => {
    const store = createJobStore();
    const { jobId } = store.start("k", async () => {
      throw new Error("canvas exploded");
    });
    await flush();
    expect(store.get(jobId)).toMatchObject({ status: "error", error: "canvas exploded" });
  });

  test("dedupes a second job for the same key while in flight", () => {
    const store = createJobStore();
    const first = store.start("k", () => new Promise(() => {}));
    const second = store.start("k", () => new Promise(() => {}));
    expect(second.jobId).toBe(first.jobId);
    expect(second.reused).toBe(true);
  });

  test("allows a new job for the same key once the first settles", async () => {
    const store = createJobStore();
    const first = store.start("k", async () => "done");
    await flush();
    const second = store.start("k", async () => "again");
    expect(second.jobId).not.toBe(first.jobId);
    expect(second.reused).toBeUndefined();
  });

  test("keys are independent", () => {
    const store = createJobStore();
    const a = store.start("a", () => new Promise(() => {}));
    const b = store.start("b", () => new Promise(() => {}));
    expect(b.jobId).not.toBe(a.jobId);
  });

  test("returns undefined for an unknown job", () => {
    expect(createJobStore().get("999")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test __tests__/job-store.test.mjs`
Expected: FAIL — cannot find module `../routes/job-store.mjs`

- [ ] **Step 3: Write the job store**

Create `routes/job-store.mjs`:

```js
// In-memory background-job store, extracted so the dedupe logic is testable.
// Same shape as the inline store in routes/participation.js:50-55.
export function createJobStore() {
  const jobs = new Map();          // jobId -> { status, key, result?, error? }
  const inFlightByKey = new Map(); // key -> jobId, only while running
  let nextJobId = 1;

  return {
    /**
     * Start `runner()` in the background under `key`. If a job for the same key
     * is still running, returns that job instead of starting a second one.
     */
    start(key, runner) {
      const existing = inFlightByKey.get(key);
      if (existing) return { jobId: existing, reused: true };

      const jobId = String(nextJobId++);
      jobs.set(jobId, { status: "running", key });
      inFlightByKey.set(key, jobId);

      Promise.resolve()
        .then(runner)
        .then((result) => jobs.set(jobId, { status: "done", key, result }))
        .catch((error) => jobs.set(jobId, { status: "error", key, error: error.message }))
        .finally(() => inFlightByKey.delete(key));

      return { jobId };
    },

    get(jobId) {
      return jobs.get(jobId);
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test __tests__/job-store.test.mjs`
Expected: PASS — 6 tests

- [ ] **Step 5: Write the router**

Create `routes/canvas.js`:

```js
// Canvas grade-export API. A live export makes one submitGrade call per student
// plus a verification pass, so it runs as a background job the client polls —
// same pattern as the Slack scan in routes/participation.js.
import express from "express";
import { loadDotenv } from "../loadDotenv.mjs";
import { createJobStore } from "./job-store.mjs";
import { processCourse, resolveCourseConfig } from "../export-lottery-to-canvas.mjs";

loadDotenv();

const router = express.Router();
const jobs = createJobStore();

// Mirrors routes/participation.js:27-31, but as a predicate rather than
// middleware: only the live run is guarded, and that is decided per-request
// from the body, not per-route.
function isLocalhost(req) {
  const ip = req.ip;
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

router.post("/export", (req, res) => {
  const { course, gradeType = "lottery", dryRun = true } = req.body || {};
  if (!course) return res.status(400).json({ error: "course is required" });

  const courseConfig = resolveCourseConfig(course);
  if (!courseConfig) {
    return res.status(400).json({ error: `${course} is not wired for Canvas export.` });
  }

  if (!dryRun) {
    if (!process.env.CANVAS_TOKEN) {
      return res
        .status(503)
        .json({ error: "CANVAS_TOKEN is not set — add it to .env to export to Canvas." });
    }
    if (!isLocalhost(req)) {
      return res.status(403).json({ error: "This action is only allowed from localhost." });
    }
  }

  // Dry and live runs are separate jobs for the same course, so key them apart —
  // otherwise a confirm would be deduped into the preview that is still running.
  const key = `${course}:${gradeType}:${dryRun ? "dry" : "live"}`;
  const { jobId, reused } = jobs.start(key, () =>
    processCourse(course, { dryRun, gradeType, verbose: false })
  );

  res.json(reused ? { jobId, reused } : { jobId });
});

router.get("/export/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "job not found" });
  res.json(job);
});

export default router;
```

- [ ] **Step 6: Mount the router**

In `app.js`, add the import beside the existing routers (line 9):

```js
import canvasRouter from "./routes/canvas.js";
```

And mount it beside the others (after line 27):

```js
app.use("/api/canvas", canvasRouter);
```

- [ ] **Step 7: Verify the endpoint end to end**

Start the server with `yarn dev`, then run:

```bash
curl -s -X POST localhost:4001/api/canvas/export \
  -H 'Content-Type: application/json' \
  -d '{"course":"webdev_summer_2026","dryRun":true}'
```

Expected: `{"jobId":"1"}`

Poll it:

```bash
sleep 10 && curl -s localhost:4001/api/canvas/export/1 | head -c 400
```

Expected: `"status":"done"` with a `result` containing `stats` and
`studentsWithGrades`.

Check the rejection path:

```bash
curl -s -X POST localhost:4001/api/canvas/export \
  -H 'Content-Type: application/json' \
  -d '{"course":"lottery_tests","dryRun":true}'
```

Expected: `{"error":"lottery_tests is not wired for Canvas export."}`

- [ ] **Step 8: Commit**

```bash
git add routes/job-store.mjs routes/canvas.js __tests__/job-store.test.mjs app.js
git commit -m "feat(canvas): add background-job export API

POST /api/canvas/export starts a dry or live run; GET polls it. Live runs
require CANVAS_TOKEN and localhost. Job store extracted from the pattern in
routes/participation.js so the in-flight dedupe is testable."
```

---

### Task 6: Export modal and Admin page wiring

**Files:**
- Create: `front/src/components/CanvasExportModal.js`
- Modify: `front/src/pages/AdminPage.js`

**Interfaces:**
- Consumes: `useCourse` from `../context/CourseContext`; `getCanvasConfig` from `../courses.mjs`; the endpoints from Task 5
- Produces: `<CanvasExportModal open course gradeType onClose />`

- [ ] **Step 1: Write the modal**

Create `front/src/components/CanvasExportModal.js`:

```js
import React, { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";

// Preview-before-write modal for Canvas grade export. Opens on a dry run,
// renders the computed grades, and only writes when the instructor confirms.
// The confirm re-runs the export live rather than replaying the preview, so a
// stale preview can never submit old grades.

const POLL_MS = 1500;

async function startExport({ course, gradeType, dryRun }) {
  const res = await fetch("/api/canvas/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ course, gradeType, dryRun }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Export failed (${res.status})`);
  return data.jobId;
}

export default function CanvasExportModal({ open, course, gradeType, onClose }) {
  const [phase, setPhase] = useState("running"); // running|preview|committing|done|error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const run = useCallback(
    async (dryRun) => {
      setPhase(dryRun ? "running" : "committing");
      setError(null);
      try {
        const jobId = await startExport({ course, gradeType, dryRun });
        pollRef.current = setInterval(async () => {
          const res = await fetch(`/api/canvas/export/${jobId}`);
          const job = await res.json();
          if (job.status === "running") return;
          stopPolling();
          if (job.status === "error") {
            setError(job.error);
            setPhase("error");
          } else if (job.result?.success === false) {
            setError(job.result.error || "Export failed.");
            setPhase("error");
          } else {
            setResult(job.result);
            setPhase(dryRun ? "preview" : "done");
          }
        }, POLL_MS);
      } catch (err) {
        setError(err.message);
        setPhase("error");
      }
    },
    [course, gradeType, stopPolling]
  );

  useEffect(() => {
    if (!open) return undefined;
    setResult(null);
    run(true);
    return stopPolling;
  }, [open, run, stopPolling]);

  if (!open) return null;

  const busy = phase === "running" || phase === "committing";
  const students = result?.studentsWithGrades || [];
  const unmatched = result?.unmatchedLottery || [];

  return (
    <div
      className="modal show d-block"
      tabIndex="-1"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={busy ? undefined : onClose}
    >
      <div
        className="modal-dialog modal-lg modal-dialog-scrollable"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              Export to Canvas — {course} ({gradeType})
            </h5>
            {!busy && (
              <button type="button" className="close" onClick={onClose}>
                <span>&times;</span>
              </button>
            )}
          </div>

          <div className="modal-body">
            {phase === "running" && <p>Computing grades…</p>}
            {phase === "committing" && <p>Submitting to Canvas…</p>}
            {phase === "error" && <div className="alert alert-danger mb-0">{error}</div>}

            {phase === "done" && (
              <div className="alert alert-success mb-0">
                Submitted {result.submitted}, {result.errors} error
                {result.errors === 1 ? "" : "s"}
                {result.verification
                  ? `, verified ${result.verification.verified}/${result.verification.total}`
                  : ""}
                .
              </div>
            )}

            {phase === "preview" && (
              <>
                <p className="mb-2">
                  <strong>{students.length}</strong> grades ready. Median{" "}
                  {result.stats?.median} pts, {result.stats?.medianCalls} calls.
                </p>

                {/* Unmatched leads: name matching runs at 70% confidence, and an
                    unmatched student is about to silently receive no grade. */}
                {unmatched.length > 0 && (
                  <div className="alert alert-warning">
                    <strong>{unmatched.length} unmatched</strong> — these students have
                    lottery points but no Canvas match, and will not be graded:
                    <ul className="mb-0 mt-1">
                      {unmatched.map((u) => (
                        <li key={u.name || u}>{u.name || u}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Lottery name</th>
                      <th>Canvas name</th>
                      <th className="text-right">Grade</th>
                      <th className="text-right">Pts</th>
                      <th className="text-right">Calls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.canvasUserId}>
                        <td>{s.lotteryName}</td>
                        <td>{s.canvasName}</td>
                        <td className="text-right">{s.grade}</td>
                        <td className="text-right">{s.points}</td>
                        <td className="text-right">{s.calls}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={busy}
            >
              {phase === "done" || phase === "error" ? "Close" : "Cancel"}
            </button>
            {phase === "preview" && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => run(false)}
                disabled={students.length === 0}
              >
                Submit {students.length} grades to Canvas
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

CanvasExportModal.propTypes = {
  open: PropTypes.bool.isRequired,
  course: PropTypes.string.isRequired,
  gradeType: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};
```

- [ ] **Step 2: Wire the Admin page**

In `front/src/pages/AdminPage.js`, add imports:

```js
import CanvasExportModal from "../components/CanvasExportModal";
import { getCanvasConfig } from "../courses.mjs";
```

Add state beside the other `useState` calls:

```js
  const [gradeType, setGradeType] = useState("lottery");
  const [exportOpen, setExportOpen] = useState(false);
```

Add this derived config above the `return`:

```js
  const canvasConfig = getCanvasConfig(course);
  const assignmentId =
    gradeType === "lottery"
      ? canvasConfig?.lotteryAssignmentId
      : canvasConfig?.accumulatedPointsAssignmentId;
  const canExport = Boolean(assignmentId);
  const exportTitle = !canvasConfig
    ? `${course} is not wired for Canvas export`
    : !canExport
      ? `${course} has no ${gradeType} assignment configured`
      : `Preview and export ${gradeType} grades to Canvas`;
```

In the header row (inside the `div` at line 53, after the course `<label>`), add:

```jsx
          <div className="d-flex align-items-center gap-2">
            <label className="mb-0">
              Grade type:{" "}
              <select
                className="form-control d-inline-block w-auto"
                value={gradeType}
                onChange={(e) => setGradeType(e.target.value)}
              >
                <option value="lottery">Lottery</option>
                <option value="accumulated">Accumulated</option>
              </select>
            </label>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setExportOpen(true)}
              disabled={!canExport}
              title={exportTitle}
            >
              Export to Canvas
            </button>
          </div>
```

Render the modal beside `StudentHistoryModal` (after line 124):

```jsx
        <CanvasExportModal
          open={exportOpen}
          course={course}
          gradeType={gradeType}
          onClose={() => setExportOpen(false)}
        />
```

- [ ] **Step 3: Build**

Run:

```bash
cd front && yarn build
```

Expected: build succeeds with no lint errors.

- [ ] **Step 4: Verify by hand**

Start the server with `yarn dev` and open `http://localhost:4001/admin`:

1. With `webdev_summer_2026` selected and grade type `Lottery`, the Export button
   is enabled. Click it — the modal opens on "Computing grades…", then shows the
   grade table with any unmatched students called out above it.
2. Switch grade type to `Accumulated` — the button is disabled with the title
   "…has no accumulated assignment configured" (that course's
   `accumulatedPointsAssignmentId` is `null`).
3. Switch course to `lottery_tests` — the button is disabled with the
   "not wired for Canvas export" title.
4. Reopen the lottery preview and click Submit. It reports
   "Submitted N, 0 errors, verified N/N".
5. Confirm the run appended lines to `canvas-export-log.txt`:
   `tail -5 canvas-export-log.txt`

- [ ] **Step 5: Run the full test suite**

Run: `yarn test`
Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
git add front/src/components/CanvasExportModal.js front/src/pages/AdminPage.js
git commit -m "feat(canvas): add export-to-Canvas UI on the Admin page

Dry run opens a preview modal listing computed grades, with unmatched
students surfaced above the table since they would otherwise be graded
silently. Confirm re-runs the export live. The button is disabled for
courses with no canvas block or no assignment for the selected grade type."
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 registry — `students.mjs` canvas block, `courses.mjs`, `canvas-config.json` trim | Task 2 |
| §1 archive fallback on the backend | Task 4 |
| §2 `CourseContext`, App mount, three call sites, `MainPage` `value=` fix | Task 3 |
| §3 job API, `processCourse` export, widened return, error table | Tasks 4, 5 |
| §4 modal, unmatched-first ordering, grade-type toggle, disabled states | Task 6 |
| §5 `instructorSlackId` | Task 1 |
| Testing — `courses.mjs`, config resolution, job dedupe | Tasks 2, 4, 5 |

The spec listed a `CourseContext` stale-key test; Jest is node-only and cannot
mount a provider, so that behavior is tested as the pure `resolveCourseKey` in
Task 2 and the provider is verified by hand in Task 3 Step 6.

**Type consistency:** `resolveCourseKey`, `buildCourseList`, `listCourses`,
`getCanvasConfig`, `COURSE_STORAGE_KEY`, `resolveCourseConfig`, `createJobStore`,
`processCourse` — each is defined once and referenced with the same name and
signature everywhere it appears.

The active `canvas` block uses `courseId`; the archived `canvas-config.json` entries
use `canvasId`. `resolveCourseConfig` normalizes to `courseId`, and `processCourse`
destructures `{ courseId: canvasId }` so the rest of that function is untouched.
