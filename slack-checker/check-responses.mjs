#!/usr/bin/env node

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createInterface } from "readline";
import mongodb from "mongodb";

// Load .env file
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
try {
  const envFile = readFileSync(envPath, "utf8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=").replace(/^["']|["']$/g, "");
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }
} catch {
  // .env file not found, rely on environment variables
}

// Import after loading env
const { parseSlackUrl, getThreadReplies, getParentMessage, getUserDisplayNames } = await import("./slack-api.mjs");
import { loadStudentRoster, matchNames, getAvailableCourses } from "./matcher.mjs";

const { MongoClient } = mongodb;
const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017";

const TWENTY_FOUR_HOURS_SEC = 24 * 60 * 60;

function printUsage() {
  console.log(`
Usage: node slack-checker/check-responses.mjs [options] <thread-url> <course> [points]

Arguments:
  thread-url  Slack thread URL (e.g., https://team.slack.com/archives/C123ABC/p1234567890)
  course      Course name from students.mjs
  points      Points to award (default: 2)

Options:
  --dry-run   Preview matches without writing to database
  --yes, -y   Skip confirmation prompt (use with caution)
  --help, -h  Show this help message

Available courses: ${getAvailableCourses().join(", ")}

Examples:
  # Preview what would happen (safe, no DB writes)
  node slack-checker/check-responses.mjs --dry-run "https://team.slack.com/archives/C123ABC/p1234567890" webdev_spring_2026

  # Award points with confirmation prompt
  node slack-checker/check-responses.mjs "https://team.slack.com/archives/C123ABC/p1234567890" webdev_spring_2026

  # Award 2 points, skip confirmation
  node slack-checker/check-responses.mjs --yes "https://team.slack.com/archives/C123ABC/p1234567890" webdev_spring_2026 2
`);
}

/**
 * Prompt user for confirmation
 */
async function confirm(message) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().startsWith("y"));
    });
  });
}

/**
 * Award points to a student using direct MongoDB insert
 */
async function awardPoints(studentName, course, points, reason, postDate) {
  const dbName = "lottery_" + course;
  const client = new MongoClient(mongoUrl, { useUnifiedTopology: true });

  try {
    await client.connect();
    const grades = client.db(dbName).collection("grades");

    const date = postDate.toDateString();

    await grades.insertOne({
      date,
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

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const options = {
    dryRun: false,
    skipConfirm: false,
    help: false,
    threadUrl: null,
    course: null,
    points: 2,
  };

  const positional = [];

  for (const arg of args) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--yes" || arg === "-y") {
      options.skipConfirm = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  if (positional.length >= 1) options.threadUrl = positional[0];
  if (positional.length >= 2) options.course = positional[1];
  if (positional.length >= 3) options.points = parseInt(positional[2], 10);

  return options;
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  if (!options.threadUrl || !options.course) {
    printUsage();
    process.exit(1);
  }

  if (isNaN(options.points) || options.points < 1) {
    console.error("Error: Points must be a positive integer");
    process.exit(1);
  }

  if (options.dryRun) {
    console.log("=== DRY RUN MODE (no database changes will be made) ===\n");
  }

  console.log(`Checking thread: ${options.threadUrl}`);
  console.log(`Course: ${options.course}`);
  console.log(`Points per responder: ${options.points}`);
  console.log("");

  // Load student roster
  let roster;
  try {
    roster = loadStudentRoster(options.course);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  // Parse Slack URL
  let channelId, messageTs;
  try {
    ({ channelId, messageTs } = parseSlackUrl(options.threadUrl));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  // Get parent message to determine time boundary
  let parentMessage;
  try {
    parentMessage = await getParentMessage(channelId, messageTs);
  } catch (error) {
    console.error(`Error fetching parent message: ${error.message}`);
    process.exit(1);
  }

  const parentTs = parseFloat(parentMessage.ts);
  const cutoffTs = parentTs + TWENTY_FOUR_HOURS_SEC;
  const parentDate = new Date(parentTs * 1000);
  const cutoffDate = new Date(cutoffTs * 1000);

  console.log(`Parent message posted: ${parentDate.toLocaleString()}`);
  console.log(`24-hour cutoff: ${cutoffDate.toLocaleString()}`);
  console.log("");

  // Get thread replies
  let replies;
  try {
    replies = await getThreadReplies(channelId, messageTs);
  } catch (error) {
    console.error(`Error fetching replies: ${error.message}`);
    process.exit(1);
  }

  // Filter replies within 24 hours
  const validReplies = replies.filter((reply) => {
    const replyTs = parseFloat(reply.ts);
    return replyTs <= cutoffTs;
  });

  console.log(`Found ${validReplies.length} replies within 24 hours (${replies.length} total replies).`);
  console.log("");

  if (validReplies.length === 0) {
    console.log("No replies to process.");
    process.exit(0);
  }

  // Get unique responders (by user ID to avoid duplicates)
  const uniqueUserIds = [...new Set(validReplies.map((r) => r.user))];

  // Get display names for all users
  console.log(`Fetching display names for ${uniqueUserIds.length} unique users...`);
  const userNames = await getUserDisplayNames(uniqueUserIds);
  console.log("");

  // Match to roster
  const slackNames = [...userNames.values()];
  const { matched, unmatched } = matchNames(slackNames, roster);

  // Display matches with confidence
  console.log("=== MATCH RESULTS ===\n");

  if (matched.length > 0) {
    console.log("MATCHED (will award points):");
    for (const { slackName, rosterName, confidence } of matched) {
      const confidenceStr = confidence < 100 ? ` [${confidence}% match]` : "";
      console.log(`  "${slackName}" -> ${rosterName}${confidenceStr}`);
    }
    console.log("");
  }

  if (unmatched.length > 0) {
    console.log("UNMATCHED (no points):");
    for (const slackName of unmatched) {
      console.log(`  "${slackName}" - no roster match found`);
    }
    console.log("");
  }

  // Build reason string
  const reason = `Responded to Slack thread: ${options.threadUrl}`;

  // Summary before action
  console.log("=== SUMMARY ===");
  console.log(`Students to award: ${matched.length}`);
  console.log(`Points each: ${options.points}`);
  console.log(`Total points: ${matched.length * options.points}`);
  console.log(`Unmatched names: ${unmatched.length}`);
  console.log("");
  console.log("Document format to be inserted:");
  console.log(`  {`);
  console.log(`    name: "<student name>",`);
  console.log(`    grade: ${options.points},`);
  console.log(`    course: "${options.course}",`);
  console.log(`    reason: "${reason}",`);
  console.log(`    date: "${parentDate.toDateString()}",`);
  console.log(`    timestamp: ${parentDate.toISOString()}`);
  console.log(`  }`);
  console.log("");

  if (matched.length === 0) {
    console.log("No students matched - nothing to do.");
    process.exit(0);
  }

  // Dry run stops here
  if (options.dryRun) {
    console.log("=== DRY RUN COMPLETE (no changes made) ===");
    console.log("Remove --dry-run flag to actually award points.");
    process.exit(0);
  }

  // Confirmation prompt
  if (!options.skipConfirm) {
    const confirmed = await confirm(
      `Award ${options.points} point(s) to ${matched.length} students? (y/N): `
    );
    if (!confirmed) {
      console.log("Aborted. No changes made.");
      process.exit(0);
    }
    console.log("");
  }

  // Award points to matched students
  console.log("=== AWARDING POINTS ===\n");
  let awardedCount = 0;
  for (const { slackName, rosterName } of matched) {
    const success = await awardPoints(rosterName, options.course, options.points, reason, parentDate);
    if (success) {
      console.log(`\u2713 Awarded ${options.points} point(s) to: ${rosterName}`);
      awardedCount++;
    } else {
      console.log(`\u2717 Failed to award points to: ${rosterName}`);
    }
  }

  console.log("");
  console.log(`=== COMPLETE: ${awardedCount} students awarded ${options.points} point(s) each ===`);
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
