// Headless Slack-thread award pipeline shared by the CLI and the HTTP API.
//
// This module must NOT statically import ./slack-api.mjs: that file calls
// process.exit(1) at load time when SLACK_BOT_TOKEN is unset, which would kill
// the test runner. Slack functions are injected via `deps` instead (the same
// dependency-injection pattern scan.mjs uses for its `slack` argument). The CLI
// and route layer build `deps` with buildDeps() after loading .env.
import { matchNames, loadStudentRoster } from "./matcher.mjs";
import { isAwarded, recordPost, markAwarded } from "./ledger.mjs";
import mongodb from "mongodb";

const { MongoClient } = mongodb;
const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017";

// --- Pure helpers (unit-tested) ------------------------------------------

/** Unix-seconds cutoff = parent timestamp + the award window (hours → seconds). */
export function computeCutoffTs(parentTs, hours) {
  return parentTs + hours * 60 * 60;
}

/** Replies posted at or before the cutoff (the ones eligible for points). */
export function filterRepliesWithinWindow(replies, cutoffTs) {
  return replies.filter((reply) => parseFloat(reply.ts) <= cutoffTs);
}

/** Unique responder user ids, preserving first-seen order. */
export function uniqueResponderIds(replies) {
  return [...new Set(replies.map((r) => r.user))];
}

// --- Grade insert (Mongo) ------------------------------------------------

/** Insert one grade doc for a student. Returns true on success. */
export async function awardPoints(studentName, course, points, reason, postDate) {
  const client = new MongoClient(mongoUrl, { useUnifiedTopology: true });
  try {
    await client.connect();
    await client
      .db("lottery_" + course)
      .collection("grades")
      .insertOne({
        date: postDate.toDateString(),
        timestamp: postDate,
        name: studentName,
        grade: points,
        course,
        reason,
      });
    return true;
  } catch (error) {
    console.error(`Error awarding points to ${studentName}:`, error.message);
    return false;
  } finally {
    await client.close();
  }
}

// --- Production deps bundle ------------------------------------------------

/**
 * Assemble the deps object for real callers. `slackApi` is the dynamically
 * imported ./slack-api.mjs module (imported by the caller after .env is loaded).
 */
export function buildDeps(slackApi) {
  return {
    parseSlackUrl: slackApi.parseSlackUrl,
    getParentMessage: slackApi.getParentMessage,
    getThreadReplies: slackApi.getThreadReplies,
    getUserDisplayNames: slackApi.getUserDisplayNames,
    loadStudentRoster,
    isAwarded,
    recordPost,
    markAwarded,
    awardPoints,
  };
}

// --- Orchestrators (dependency-injected) ---------------------------------

/**
 * Dry-run: resolve a thread URL to its matched/unmatched responders without
 * writing anything. Throws if the URL is invalid or the roster can't load.
 */
export async function previewThread({ course, threadUrl, hours }, deps) {
  const parsed = deps.parseSlackUrl(threadUrl);
  const roster = deps.loadStudentRoster(course);
  const alreadyAwarded = await deps.isAwarded(course, parsed.messageTs);

  const parent = await deps.getParentMessage(parsed.channelId, parsed.messageTs);
  const parentTs = parseFloat(parent.ts);
  const cutoffTs = computeCutoffTs(parentTs, hours);

  const replies = await deps.getThreadReplies(parsed.channelId, parsed.messageTs);
  const validReplies = filterRepliesWithinWindow(replies, cutoffTs);
  const userIds = uniqueResponderIds(validReplies);
  const userNames = await deps.getUserDisplayNames(userIds);
  const { matched, unmatched } = matchNames([...userNames.values()], roster);

  return {
    threadTs: parsed.messageTs,
    channelId: parsed.channelId,
    parentText: parent.text || "",
    parentDate: new Date(parentTs * 1000),
    cutoffDate: new Date(cutoffTs * 1000),
    replyCount: validReplies.length,
    matched,
    unmatched,
    alreadyAwarded,
  };
}

/**
 * Record a post by URL as a manual reference example (source: "manual",
 * awarded: false) so its text seeds the scanner. Does not award anyone.
 * Returns { threadTs, parentText }.
 */
export async function addPostByUrl({ course, threadUrl }, deps) {
  const parsed = deps.parseSlackUrl(threadUrl);
  const parent = await deps.getParentMessage(parsed.channelId, parsed.messageTs);
  const parentText = parent.text || "";
  await deps.recordPost(course, {
    threadTs: parsed.messageTs,
    url: threadUrl,
    channel: parsed.channelId,
    text: parentText,
    source: "manual",
    awarded: false,
  });
  return { threadTs: parsed.messageTs, parentText };
}

/**
 * Commit: preview the thread, then (unless it's a dedup skip) insert a grade
 * per matched student and record/mark the post in the ledger. Returns the
 * preview fields plus { awarded } (number of grades actually written).
 */
export async function commitAward({ course, threadUrl, points, hours, topUp }, deps) {
  const preview = await previewThread({ course, threadUrl, hours }, deps);

  // Dedup guard: an already-awarded post is skipped unless the caller opts into
  // a top-up (awarding only-new responders for the same thread).
  if (preview.alreadyAwarded && !topUp) {
    return { ...preview, awarded: 0 };
  }

  const reason = `Responded to Slack thread: ${threadUrl}`;
  let awarded = 0;
  for (const { rosterName } of preview.matched) {
    const ok = await deps.awardPoints(rosterName, course, points, reason, preview.parentDate);
    if (ok) awarded++;
  }

  if (awarded > 0) {
    await deps.recordPost(course, {
      threadTs: preview.threadTs,
      url: threadUrl,
      channel: preview.channelId,
      text: preview.parentText,
      source: "award",
      awarded: true,
    });
    await deps.markAwarded(course, preview.threadTs, { points, studentCount: awarded });
  }

  return { ...preview, awarded };
}
