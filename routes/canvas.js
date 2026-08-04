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
