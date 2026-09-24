// Canvas grade-export API. A live export makes one submitGrade call per student
// plus a verification pass, so it runs as a background job the client polls —
// same pattern as the Slack scan in routes/participation.js.
import express from "express";
import { loadDotenv } from "../loadDotenv.mjs";
import { createJobStore, createCourseLock } from "./job-store.mjs";
import { isLocalhost } from "./request-guard.mjs";
import { processCourse, resolveCourseConfig } from "../export-lottery-to-canvas.mjs";
import { listCourses } from "../front/src/courses.mjs";

loadDotenv();

const router = express.Router();
const jobs = createJobStore();
const liveLock = createCourseLock();

// Runs each course in turn and keeps going past a failure, like the CLI's
// --all. Only active students.mjs courses: archived canvas-config.json courses
// stay CLI-only so "all" in the UI means "everything in the course picker".
async function exportAll(courses, { dryRun, log }) {
  const results = [];
  for (const courseName of courses) {
    try {
      const result = await processCourse(courseName, { dryRun, verbose: true, log });
      results.push({ courseName, ...result });
    } catch (error) {
      log(`Error processing ${courseName}: ${error.message}`);
      results.push({ courseName, success: false, error: error.message });
    }
  }
  return { success: true, results };
}

router.post("/export", (req, res) => {
  const body = req.body || {};
  // Only a literal `false` means live and only a literal `true` means all
  // courses: a truthy string or "" from a stray or forged body must never
  // flip either one.
  const dryRun = body.dryRun !== false;
  const all = body.all === true;
  const { course } = body;
  if (!all && !course) return res.status(400).json({ error: "course is required" });

  const wired = listCourses().filter((c) => c.hasCanvas).map((c) => c.key);
  let courses = [course];
  if (all) {
    // A live all-courses run writes exactly the courses the instructor saw
    // previewed. Re-deriving the list here would also submit a course whose
    // preview failed, i.e. write grades nobody looked at.
    if (!dryRun && !Array.isArray(body.courses)) {
      return res.status(400).json({ error: "A live all-courses export must list its courses." });
    }
    courses = Array.isArray(body.courses) ? body.courses : wired;
    const unknown = courses.filter((c) => !wired.includes(c));
    if (unknown.length > 0) {
      return res
        .status(400)
        .json({ error: `Not wired for Canvas export: ${unknown.join(", ")}` });
    }
  }
  if (courses.length === 0) {
    return res.status(400).json({ error: "No courses are wired for Canvas export." });
  }
  if (!all && !resolveCourseConfig(course)) {
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
  const key = `${all ? `all:${courses.join(",")}` : course}:${dryRun ? "dry" : "live"}`;

  // Taken synchronously, before any await, so two requests can't both pass.
  if (!dryRun) {
    const { ok, busy } = liveLock.tryAcquire(courses);
    if (!ok) {
      return res.status(409).json({
        error: `A live export is already running for ${busy.join(", ")}. Wait for it to finish.`,
      });
    }
  }

  const { jobId, reused } = jobs.start(key, async (log) => {
    try {
      return all
        ? await exportAll(courses, { dryRun, log })
        : await processCourse(course, { dryRun, verbose: true, log });
    } finally {
      if (!dryRun) liveLock.release(courses);
    }
  });

  res.json(reused ? { jobId, reused } : { jobId });
});

router.get("/export/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "job not found" });
  res.json(job);
});

export default router;
