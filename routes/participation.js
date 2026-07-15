// Slack participation-points API. Wraps the already-tested slack-checker
// modules. Mutating endpoints (added in Milestone 2) reuse the localhost guard
// from routes/index.js. The slow semantic scan runs as a background job that the
// client polls, so a 30s+ first run never blocks an HTTP request.
import express from "express";
import { loadDotenv } from "../loadDotenv.mjs";
import { getAvailableCourses } from "../slack-checker/matcher.mjs";
import { getPosts } from "../slack-checker/ledger.mjs";
import { scanOffers } from "../slack-checker/scan.mjs";
import {
  buildDeps,
  previewThread,
  commitAward,
  addPostByUrl,
} from "../slack-checker/award-service.mjs";

loadDotenv();

const router = express.Router();

const DEFAULT_HOURS = 24;
const DEFAULT_POINTS = 2;

// Reject mutating requests that don't originate from the instructor's machine
// (same intent as routes/index.js's `req.ip !== "127.0.0.1"` guard). The server
// binds to 127.0.0.1, so legitimate traffic arrives as IPv4 (or IPv6 loopback).
function localhostOnly(req, res, next) {
  const ip = req.ip;
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return next();
  return res.status(403).json({ error: "This action is only allowed from localhost." });
}

// Build the award-service deps from the lazily-imported slack-api module.
async function getDeps() {
  return buildDeps(await getSlackApi());
}

// slack-api.mjs calls process.exit(1) at import time when SLACK_BOT_TOKEN is
// unset. Import it lazily (and only once a token exists) so a missing token
// yields a clean 503 instead of killing the server. The module is cached.
let slackApiPromise = null;
function getSlackApi() {
  if (!process.env.SLACK_BOT_TOKEN) {
    throw new Error("SLACK_BOT_TOKEN is not set — add it to .env to use Slack features.");
  }
  if (!slackApiPromise) slackApiPromise = import("../slack-checker/slack-api.mjs");
  return slackApiPromise;
}

// --- In-memory scan job store --------------------------------------------
// jobId -> { status: "running" | "done" | "error", course, result?, error? }
const scanJobs = new Map();
// course -> jobId, present only while a scan is in flight (dedupe concurrent scans).
const inFlightByCourse = new Map();
let nextJobId = 1;

router.get("/courses", (req, res) => {
  res.json({ courses: getAvailableCourses() });
});

router.post("/scan", async (req, res) => {
  const course = req.body?.course;
  if (!course) return res.status(400).json({ error: "course is required" });

  // Reuse an in-flight scan for the same course instead of starting a second one.
  const existing = inFlightByCourse.get(course);
  if (existing) return res.json({ jobId: existing, reused: true });

  let slackApi;
  try {
    slackApi = await getSlackApi();
  } catch (err) {
    return res.status(503).json({ error: err.message });
  }

  const jobId = String(nextJobId++);
  scanJobs.set(jobId, { status: "running", course });
  inFlightByCourse.set(course, jobId);

  const { listChannels, getChannelHistory, getPermalink } = slackApi;
  scanOffers(course, { listChannels, getChannelHistory, getPermalink })
    .then(async (result) => {
      // Resolve a permalink per candidate so the UI can preview/award it by URL.
      for (const c of result.candidates || []) {
        try {
          c.url = await getPermalink(c.channelId, c.ts);
        } catch {
          c.url = null;
        }
      }
      scanJobs.set(jobId, { status: "done", course, result });
    })
    .catch((error) => scanJobs.set(jobId, { status: "error", course, error: error.message }))
    .finally(() => inFlightByCourse.delete(course));

  res.json({ jobId });
});

router.get("/scan/:jobId", (req, res) => {
  const job = scanJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "job not found" });
  res.json(job);
});

router.get("/posts", async (req, res) => {
  const course = req.query.course;
  if (!course) return res.status(400).json({ error: "course is required" });
  try {
    res.json({ posts: await getPosts(course) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dry-run: resolve a thread to its matched/unmatched responders. No DB writes,
// so this is not localhost-guarded (read-only).
router.post("/preview", async (req, res) => {
  const { course, threadUrl, hours = DEFAULT_HOURS } = req.body || {};
  if (!course || !threadUrl) {
    return res.status(400).json({ error: "course and threadUrl are required" });
  }
  let deps;
  try {
    deps = await getDeps();
  } catch (err) {
    return res.status(503).json({ error: err.message });
  }
  try {
    res.json(await previewThread({ course, threadUrl, hours }, deps));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Commit: award points to the matched responders and record the ledger.
router.post("/award", localhostOnly, async (req, res) => {
  const {
    course,
    threadUrl,
    points = DEFAULT_POINTS,
    hours = DEFAULT_HOURS,
    topUp = false,
  } = req.body || {};
  if (!course || !threadUrl) {
    return res.status(400).json({ error: "course and threadUrl are required" });
  }
  let deps;
  try {
    deps = await getDeps();
  } catch (err) {
    return res.status(503).json({ error: err.message });
  }
  try {
    res.json(await commitAward({ course, threadUrl, points, hours, topUp }, deps));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Teach the scanner: record a post as a manual reference; optionally award it too.
router.post("/add-by-url", localhostOnly, async (req, res) => {
  const {
    course,
    threadUrl,
    award = false,
    points = DEFAULT_POINTS,
    hours = DEFAULT_HOURS,
  } = req.body || {};
  if (!course || !threadUrl) {
    return res.status(400).json({ error: "course and threadUrl are required" });
  }
  let deps;
  try {
    deps = await getDeps();
  } catch (err) {
    return res.status(503).json({ error: err.message });
  }
  try {
    const added = await addPostByUrl({ course, threadUrl }, deps);
    // Operator explicitly chose to award this just-recorded post → bypass dedup.
    const awardResult = award
      ? await commitAward({ course, threadUrl, points, hours, topUp: true }, deps)
      : null;
    res.json({ ...added, award: awardResult });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
