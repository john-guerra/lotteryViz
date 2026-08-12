// Course registry. students.mjs is gitignored and holds DATA ONLY; this tracked
// module holds the logic that derives the course list from it. Frontend-safe:
// it must never import canvas-config.json, which lives outside front/src/ and
// would be rejected by CRA's ModuleScopePlugin. The archived-semester fallback
// lives on the backend, in export-lottery-to-canvas.mjs.
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
