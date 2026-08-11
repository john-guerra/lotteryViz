#!/usr/bin/env node

/**
 * Export lottery participation grades to Canvas
 *
 * Usage:
 *   npm run export_to_canvas -- --course aicoding_spring_2026 --dry-run
 *   npm run export_to_canvas -- --course db_spring_2026
 *   npm run export_to_canvas -- --all
 */

import myDB from "./db/myDB.js";
import { classes } from "./front/src/students.mjs";
import { enrichPointHistory, computeParticipation } from "./slack-checker/ledger-format.mjs";
import { getAwardedPosts } from "./slack-checker/ledger.mjs";
import {
  normalizeName,
  stripNoiseWords,
  similarity,
} from "./slack-checker/matcher.mjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Load .env file manually (Node.js compatible)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

// Load config
const configPath = path.join(__dirname, "canvas-config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

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

// Log file path
const logFilePath = path.join(__dirname, "canvas-export-log.txt");

/**
 * Log a change to the log file and console
 */
function logChange(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFilePath, logLine);
  console.log(logLine.trim());
}

// Canvas API configuration
const CANVAS_DOMAIN = process.env.CANVAS_DOMAIN || "northeastern.instructure.com";
const CANVAS_API_URL = process.env.CANVAS_API_URL || `https://${CANVAS_DOMAIN}/api/v1`;
const CANVAS_TOKEN = process.env.CANVAS_TOKEN;

/**
 * Make a Canvas API request
 */
async function canvasRequest(endpoint, options = {}) {
  if (!CANVAS_TOKEN) {
    throw new Error(
      "CANVAS_TOKEN environment variable is required. Set it to your Canvas API token."
    );
  }

  const url = `${CANVAS_API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${CANVAS_TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Canvas API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

/**
 * Get all pages of a paginated Canvas API response
 */
async function canvasRequestAllPages(endpoint) {
  const results = [];
  let url = `${CANVAS_API_URL}${endpoint}`;

  while (url) {
    if (!CANVAS_TOKEN) {
      throw new Error("CANVAS_TOKEN environment variable is required.");
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${CANVAS_TOKEN}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Canvas API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    results.push(...data);

    // Check for next page in Link header
    const linkHeader = response.headers.get("Link");
    url = null;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        url = nextMatch[1];
      }
    }
  }

  return results;
}

/**
 * Get Canvas enrollments for a course
 */
async function getCanvasEnrollments(courseId) {
  const enrollments = await canvasRequestAllPages(
    `/courses/${courseId}/enrollments?type[]=StudentEnrollment&state[]=active&per_page=100`
  );
  return enrollments.map((e) => ({
    userId: e.user_id,
    name: e.user.name,
    sortableName: e.user.sortable_name,
  }));
}

/**
 * Get lottery counts from MongoDB
 * Returns Promise with array of { _id: name, count: number, sum: points }
 */
function getLotteryCounts(course) {
  return new Promise((resolve, reject) => {
    myDB.getCounts(course, (result) => {
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Get all individual lottery entries from MongoDB
 * Returns Promise with array of { name, grade, timestamp, date, course, reason? }
 */
function getAllLotteryEntries(course) {
  return new Promise((resolve, reject) => {
    myDB.getAllGrades(course, (result) => {
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Find an existing assignment by name in a Canvas course
 */
async function findExistingAssignment(courseId, name) {
  const assignments = await canvasRequestAllPages(
    `/courses/${courseId}/assignments?per_page=100`
  );
  return assignments.find((a) => a.name === name);
}

/**
 * Get assignment details by ID
 */
async function getAssignment(courseId, assignmentId) {
  return canvasRequest(`/courses/${courseId}/assignments/${assignmentId}`);
}

/**
 * Get assignment groups for a course (for looking up group names)
 */
async function getAssignmentGroups(courseId) {
  return canvasRequestAllPages(`/courses/${courseId}/assignment_groups?per_page=100`);
}

/**
 * Parse a name into parts for matching
 */
function parseNameParts(name) {
  const cleaned = stripNoiseWords(name);
  const normalized = normalizeName(cleaned);
  const parts = normalized.split(" ").filter((p) => p.length > 0);

  return {
    original: name,
    normalized,
    parts,
    firstName: parts[0] || "",
    lastName: parts[parts.length - 1] || "",
  };
}

// Minimum confidence score (0-100) for a name match to be accepted.
// Referenced by both scoreNameMatch (cap logic) and matchLotteryToCanvas (threshold).
const MIN_CONFIDENCE = 70;

/**
 * Score how well two names match
 */
function scoreNameMatch(name1Parts, name2Parts) {
  // Exact normalized match
  if (name1Parts.normalized === name2Parts.normalized) return 100;

  // Check if all parts of shorter name are in longer name
  const shorter =
    name1Parts.parts.length <= name2Parts.parts.length ? name1Parts : name2Parts;
  const longer =
    name1Parts.parts.length > name2Parts.parts.length ? name1Parts : name2Parts;

  const allPartsMatch = shorter.parts.every((part) =>
    longer.parts.some((p) => p === part || similarity(p, part) >= 85)
  );

  if (allPartsMatch && shorter.parts.length >= 2) return 95;

  // First and last name match
  if (
    name1Parts.firstName === name2Parts.firstName &&
    name1Parts.lastName === name2Parts.lastName
  ) {
    return 90;
  }

  // Component-aware scoring: compare first and last names independently
  // to avoid false positives from shared first names (e.g. "Daniel Luo" ↔ "Daniel Kim")
  if (name1Parts.parts.length >= 2 && name2Parts.parts.length >= 2) {
    const firstSim = similarity(name1Parts.firstName, name2Parts.firstName);
    const lastSim = similarity(name1Parts.lastName, name2Parts.lastName);

    // Different last names → cap below MIN_CONFIDENCE to prevent false positives
    if (lastSim < 50) {
      return Math.min(60, Math.round(firstSim * 0.4 + lastSim * 0.6));
    }

    // Weighted average: last name is a stronger identifier than first name.
    // Use max of component vs raw so component scoring only raises scores —
    // the hard cap above already handles the false-positive prevention.
    const componentScore = Math.round(firstSim * 0.4 + lastSim * 0.6);
    const rawSim = similarity(name1Parts.normalized, name2Parts.normalized);
    return Math.max(componentScore, rawSim);
  }

  // Fallback for single-part names: raw similarity on full string
  return similarity(name1Parts.normalized, name2Parts.normalized);
}

/**
 * Match lottery names to Canvas enrollments using a two-pass algorithm.
 *
 * Matching strategy:
 *   Pass 1 (Bet) — For each lottery entry, find the highest-scoring Canvas
 *     student above MIN_CONFIDENCE. Multiple lottery entries may claim the
 *     same Canvas student at this stage.
 *   Pass 2 (Resolve) — Group claims by Canvas userId. When multiple lottery
 *     entries claim the same student, keep only the highest confidence match.
 *     Displaced losers move to unmatchedLottery with a `displaced` flag.
 *
 * Scoring (scoreNameMatch):
 *   - Exact normalized name match → 100
 *   - All name parts found in other name → 95
 *   - First + last name exact match → 90
 *   - Component-aware: firstName (40%) + lastName (60%), with a hard cap at
 *     60 when last names clearly differ (similarity < 50) — prevents false
 *     positives from shared first names like "Daniel Luo" ↔ "Daniel Kim".
 *   - Single-part names fall back to raw Levenshtein similarity.
 */
function matchLotteryToCanvas(lotteryCounts, canvasEnrollments) {
  // Pre-parse Canvas names
  const canvasParsed = canvasEnrollments.map((e) => ({
    ...e,
    parsed: parseNameParts(e.name),
  }));

  // === Pass 1: Bet — compute best Canvas match for each lottery entry ===
  const candidates = [];
  for (const lotteryEntry of lotteryCounts) {
    const lotteryParsed = parseNameParts(lotteryEntry._id);
    let bestMatch = null;
    let bestScore = 0;

    for (const canvasStudent of canvasParsed) {
      const score = scoreNameMatch(lotteryParsed, canvasStudent.parsed);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = canvasStudent;
      }
    }

    candidates.push({ lotteryEntry, bestMatch, bestScore });
  }

  // === Pass 2: Resolve — deduplicate claims per Canvas student ===
  const claimsByCanvasId = new Map();  // canvasUserId → best candidate
  const ties = [];                     // tied claims requiring manual review
  for (const candidate of candidates) {
    if (!candidate.bestMatch || candidate.bestScore < MIN_CONFIDENCE) continue;

    const canvasId = candidate.bestMatch.userId;
    const existing = claimsByCanvasId.get(canvasId);
    if (!existing) {
      claimsByCanvasId.set(canvasId, candidate);
    } else if (candidate.bestScore > existing.bestScore) {
      claimsByCanvasId.set(canvasId, candidate);
    } else if (candidate.bestScore === existing.bestScore) {
      // Exact tie — flag for manual review instead of silently picking one
      ties.push({
        canvasName: candidate.bestMatch.name,
        canvasUserId: canvasId,
        entries: [existing.lotteryEntry._id, candidate.lotteryEntry._id],
        score: candidate.bestScore,
      });
    }
  }

  const winners = new Set(claimsByCanvasId.values());

  // === Build results ===
  const matched = [];
  const unmatchedLottery = [];

  for (const candidate of candidates) {
    if (winners.has(candidate)) {
      matched.push({
        lotteryName: candidate.lotteryEntry._id,
        canvasName: candidate.bestMatch.name,
        canvasUserId: candidate.bestMatch.userId,
        calls: candidate.lotteryEntry.count,
        points: candidate.lotteryEntry.sum,
        confidence: candidate.bestScore,
      });
    } else {
      // Was this entry above threshold but lost to a higher-confidence claim?
      const displaced =
        candidate.bestMatch != null &&
        candidate.bestScore >= MIN_CONFIDENCE;
      unmatchedLottery.push({
        name: candidate.lotteryEntry._id,
        calls: candidate.lotteryEntry.count,
        points: candidate.lotteryEntry.sum,
        bestMatch: candidate.bestMatch?.name,
        bestScore: candidate.bestScore,
        displaced,
      });
    }
  }

  // Find Canvas students with no lottery entries
  const matchedUserIds = new Set(matched.map((m) => m.canvasUserId));
  const noLotteryEntries = canvasEnrollments
    .filter((e) => !matchedUserIds.has(e.userId))
    .map((e) => ({
      canvasName: e.name,
      canvasUserId: e.userId,
      calls: 0,
      points: 0,
    }));

  return { matched, unmatchedLottery, noLotteryEntries, ties };
}

/**
 * Compute percentile-based grade
 *
 * Formula:
 *   - Above median: linear from 100 to 110
 *   - Below median: quadratic penalty based on standard deviations
 *     - At median -> 100
 *     - 1 SD below -> 78
 *     - 2 SD below -> 11
 *     - 3 SD below -> -100
 */
function computeGrade(studentPoints, allPointsSorted, stats) {
  if (allPointsSorted.length <= 1) {
    return 100; // Single student gets median grade
  }

  // Students exactly at median get 100
  if (studentPoints === stats.median) {
    return 100;
  }

  if (studentPoints > stats.median) {
    // Above median: linear from 100 to 110
    const percentile =
      (allPointsSorted.filter((p) => p < studentPoints).length /
        Math.max(1, allPointsSorted.length - 1)) *
      100;
    const grade = 100 + ((percentile - 50) / 50) * 10;
    return Math.round(grade * 100) / 100;
  } else {
    // Below median: quadratic penalty based on SDs below median
    const sdsBelowMedian =
      stats.stdDev > 0 ? (stats.median - studentPoints) / stats.stdDev : 0;
    // Quadratic: grade = 100 - 200 * (sdsBelowMedian/3)²
    // At 3 SD below → -100, smooth curve in between
    const grade = 100 - 200 * Math.pow(sdsBelowMedian / 3, 2);
    return Math.max(-100, Math.round(grade * 100) / 100);
  }
}

/**
 * Submit grade to Canvas
 */
async function submitGrade(courseId, assignmentId, userId, grade, comment) {
  const endpoint = `/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`;
  const body = {
    submission: {
      posted_grade: grade.toString(),
    },
  };

  if (comment) {
    body.comment = { text_comment: comment };
  }

  return canvasRequest(endpoint, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/**
 * Create a lottery assignment if it doesn't exist
 */
async function createLotteryAssignment(courseId, name = "Lottery Grade", assignmentGroupId = null) {
  const endpoint = `/courses/${courseId}/assignments`;
  const body = {
    assignment: {
      name,
      points_possible: 100,
      grading_type: "points",
      submission_types: ["none"],
      published: true,
    },
  };

  if (assignmentGroupId) {
    body.assignment.assignment_group_id = assignmentGroupId;
  }

  const result = await canvasRequest(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
  });

  return result;
}

/**
 * Verify grades were saved correctly by fetching them back from Canvas
 */
async function verifyGrades(courseId, assignmentId, expectedGrades) {
  const submissions = await canvasRequestAllPages(
    `/courses/${courseId}/assignments/${assignmentId}/submissions?per_page=100`
  );

  let verified = 0;
  const mismatches = [];

  for (const expected of expectedGrades) {
    const submission = submissions.find((s) => s.user_id === expected.userId);
    if (submission && Math.abs(parseFloat(submission.grade) - expected.grade) < 0.01) {
      verified++;
    } else {
      mismatches.push({
        name: expected.name,
        expected: expected.grade,
        actual: submission?.grade || "not found",
      });
    }
  }

  return { verified, mismatches, total: expectedGrades.length };
}

/**
 * Process a single course
 */
async function processCourse(courseName, options = {}) {
  const { dryRun = false, verbose = false } = options;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing course: ${courseName}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`${"=".repeat(60)}\n`);

  const courseConfig = resolveCourseConfig(courseName);
  if (!courseConfig) {
    console.error(`Course "${courseName}" not found in config.`);
    console.log(
      "Available courses:",
      [
        ...Object.keys(classes).filter((k) => classes[k].canvas),
        ...Object.keys(config.courses),
      ].join(", ")
    );
    return { success: false, courseName, error: "Course not found" };
  }

  const {
    courseId: canvasId,
    lotteryAssignmentId,
    participationGroupId,
  } = courseConfig;

  // Determine which assignment to use
  let assignmentId = lotteryAssignmentId;

  // A null assignmentId is not an error: the live run (Step 7) finds or creates
  // the assignment in Canvas. Dry runs never reach that code, so a preview for
  // an unconfigured assignment still computes grades correctly.

  // Step 1: Get lottery data from MongoDB
  console.log("Fetching lottery data from MongoDB...");
  let lotteryCounts;
  try {
    lotteryCounts = await getLotteryCounts(courseName);
    console.log(`  Found ${lotteryCounts.length} students with lottery entries`);
  } catch (error) {
    console.error("  Error fetching lottery data:", error.message);
    return { success: false, error: error.message };
  }

  // Slack-post ledger for readable participation history (empty if none yet).
  let awardedPosts = [];
  let postsByUrl = {};
  try {
    awardedPosts = await getAwardedPosts(courseName);
    postsByUrl = Object.fromEntries(awardedPosts.map((p) => [p.url, p]));
  } catch (error) {
    console.log("  Note: could not load Slack ledger:", error.message);
  }

  // Step 2: Get Canvas enrollments
  console.log("Fetching Canvas enrollments...");
  let canvasEnrollments;
  try {
    canvasEnrollments = await getCanvasEnrollments(canvasId);
    console.log(`  Found ${canvasEnrollments.length} enrolled students`);
  } catch (error) {
    console.error("  Error fetching Canvas enrollments:", error.message);
    return { success: false, error: error.message };
  }

  // Step 3: Match lottery names to Canvas students
  console.log("Matching students...");
  const { matched, unmatchedLottery, noLotteryEntries, ties } = matchLotteryToCanvas(
    lotteryCounts,
    canvasEnrollments
  );
  console.log(`  Matched: ${matched.length}`);
  console.log(`  Unmatched lottery entries: ${unmatchedLottery.length}`);
  console.log(`  Canvas students with no lottery entries: ${noLotteryEntries.length}`);
  if (ties.length > 0) {
    console.log(`  Matching ties requiring review: ${ties.length}`);
  }

  // Step 3.5: Fetch all individual lottery entries for detailed comments
  console.log("Fetching individual lottery entries...");
  let allEntries = [];
  try {
    allEntries = await getAllLotteryEntries(courseName);
    console.log(`  Found ${allEntries.length} individual entries`);
  } catch (error) {
    console.error("  Error fetching lottery entries:", error.message);
    // Continue without detailed entries - comments will show "(No entries)"
  }

  // Group entries by student name (uppercase for matching)
  const entriesByStudent = new Map();
  for (const entry of allEntries) {
    const key = entry.name.toUpperCase();
    if (!entriesByStudent.has(key)) {
      entriesByStudent.set(key, []);
    }
    entriesByStudent.get(key).push(entry);
  }

  // Step 4: Combine matched students with those who have no entries (0 points)
  const allStudents = [
    ...matched.map((m) => ({
      canvasName: m.canvasName,
      canvasUserId: m.canvasUserId,
      lotteryName: m.lotteryName,
      calls: m.calls,
      points: m.points,
      confidence: m.confidence,
    })),
    ...noLotteryEntries.map((s) => ({
      canvasName: s.canvasName,
      canvasUserId: s.canvasUserId,
      lotteryName: null,
      calls: 0,
      points: 0,
      confidence: 100,
    })),
  ];

  // Step 5: Compute grades based on percentile
  const allPointsSorted = [...allStudents.map((s) => s.points)].sort(
    (a, b) => a - b
  );

  // Get the per-class median adjustment from students.mjs config
  const medianAdjustment = classes[courseName]?.medianAdjustment ?? 0;

  // Shift all points by the adjustment before grading so the percentile
  // formula stays coherent. If only stats.median is shifted, students
  // between the adjusted and raw medians get grades < 100 despite being
  // above the effective threshold. Shifting all points preserves relative
  // ranking while moving the "grade 100" reference point correctly.
  const adjustedPointsSorted = allPointsSorted.map((p) => p - medianAdjustment);

  const mean =
    adjustedPointsSorted.reduce((a, b) => a + b, 0) / adjustedPointsSorted.length || 0;
  const variance =
    adjustedPointsSorted.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) /
    adjustedPointsSorted.length;
  const stats = {
    median: adjustedPointsSorted[Math.floor(adjustedPointsSorted.length / 2)],
    stdDev: Math.sqrt(variance),
  };

  const studentsWithGrades = allStudents.map((student) => ({
    ...student,
    // Use raw student points against the shifted distribution so that
    // a student at the adjusted median lands at the 50th percentile.
    grade: computeGrade(student.points, adjustedPointsSorted, stats),
    percentile:
      (adjustedPointsSorted.filter((p) => p < student.points).length /
        Math.max(1, adjustedPointsSorted.length - 1)) *
      100,
  }));

  // Sort by points descending for display
  studentsWithGrades.sort((a, b) => b.points - a.points);

  // Step 6: Display results
  console.log("\n--- Grade Preview ---\n");
  console.log(
    "Name".padEnd(35) +
      "Calls".padStart(7) +
      "Points".padStart(8) +
      "Percentile".padStart(12) +
      "Grade".padStart(8)
  );
  console.log("-".repeat(70));

  for (const student of studentsWithGrades) {
    const name = student.canvasName.substring(0, 34);
    console.log(
      name.padEnd(35) +
        student.calls.toString().padStart(7) +
        student.points.toString().padStart(8) +
        student.percentile.toFixed(1).padStart(11) + "%" +
        student.grade.toFixed(1).padStart(7)
    );
  }

  // === WARNINGS ===

  // Matching ties — require manual review
  if (ties.length > 0) {
    console.log("\n" + "!".repeat(70));
    console.log("!!  ACTION REQUIRED: Matching ties detected — manual review needed  !!");
    console.log("!".repeat(70));
    console.log("Multiple lottery entries matched the same Canvas student with identical");
    console.log("confidence. The first entry was kept, but this may be wrong.\n");
    for (const tie of ties) {
      console.log(`  Canvas: ${tie.canvasName} (score: ${tie.score}%)`);
      console.log(`    Tied entries: ${tie.entries.join(", ")}`);
    }
    console.log("");
  }

  // Canvas students with NO lottery entries — prominent warning
  if (noLotteryEntries.length > 0) {
    console.log("\n" + "!".repeat(70));
    console.log("!!  WARNING: Canvas students with NO lottery entries in MongoDB  !!");
    console.log("!".repeat(70));
    console.log("These students are enrolled in Canvas but have no matching lottery record.");
    console.log("They will receive 0 points.\n");
    for (const entry of noLotteryEntries) {
      console.log(`  [!] ${entry.canvasName}`);
    }
    console.log("");
  }

  // MongoDB entries not matched to Canvas — informational
  if (unmatchedLottery.length > 0) {
    console.log("\n--- Unmatched Lottery Entries (not in Canvas) ---\n");
    for (const entry of unmatchedLottery) {
      const reason = entry.displaced
        ? "DISPLACED by higher-confidence match"
        : "no Canvas match found";
      console.log(
        `  ${entry.name} (${entry.calls} calls, ${entry.points} pts) - ${reason} | Best: ${entry.bestMatch || "none"} (${entry.bestScore}%)`
      );
    }
  }

  // Add display stats
  stats.total = studentsWithGrades.length;
  stats.max = Math.max(...allPointsSorted);
  stats.min = Math.min(...allPointsSorted);
  stats.mean = mean;

  // Calculate median calls
  const allCallsSorted = [...allStudents.map((s) => s.calls)].sort((a, b) => a - b);
  stats.medianCalls = allCallsSorted[Math.floor(allCallsSorted.length / 2)];

  console.log("\n--- Statistics ---");
  console.log(`  Total students: ${stats.total}`);
  const rawMedian = allPointsSorted[Math.floor(allPointsSorted.length / 2)];
  const medianDisplay = medianAdjustment > 0
    ? `${stats.median} (raw: ${rawMedian}, adjustment: -${medianAdjustment})`
    : `${stats.median}`;
  console.log(`  Points - Min: ${stats.min}, Max: ${stats.max}, Median: ${medianDisplay}, Mean: ${stats.mean.toFixed(1)}`);
  console.log(`  Calls - Median: ${stats.medianCalls}`);

  // Hoisted above the dry-run branch so they are visible at the return, letting
  // an HTTP caller report the outcome. A dry run returns zeros and null.
  let submitted = 0;
  let errors = 0;
  let verification = null;

  // Step 7: Submit grades to Canvas (if not dry run)
  if (!dryRun) {
    // Fetch assignment groups to get group names for logging
    let assignmentGroups = [];
    try {
      assignmentGroups = await getAssignmentGroups(canvasId);
    } catch (error) {
      console.log("  Warning: Could not fetch assignment groups:", error.message);
    }
    const getGroupName = (groupId) => {
      const group = assignmentGroups.find((g) => g.id === groupId);
      return group ? group.name : `Group ID ${groupId}`;
    };

    logChange(`EXPORT STARTED: ${courseName} (Canvas ID: ${canvasId})`);

    let assignmentName;
    let assignmentGroupName;

    if (!assignmentId) {
      console.log("\n--- Checking for Existing Assignment ---");
      assignmentName = "Lottery Grade";
      try {
        // Check for existing assignment first
        const existing = await findExistingAssignment(canvasId, assignmentName);
        if (existing) {
          assignmentId = existing.id;
          assignmentGroupName = getGroupName(existing.assignment_group_id);
          console.log(`  Found existing assignment: "${assignmentName}" (ID: ${assignmentId})`);
          console.log(`  Assignment group: ${assignmentGroupName}`);
          logChange(`ASSIGNMENT FOUND: "${assignmentName}" (ID: ${assignmentId}) in group "${assignmentGroupName}"`);
        } else {
          console.log("  No existing assignment found, creating new one...");
          const newAssignment = await createLotteryAssignment(
            canvasId,
            assignmentName,
            participationGroupId
          );
          assignmentId = newAssignment.id;
          assignmentGroupName = getGroupName(newAssignment.assignment_group_id);
          console.log(`  Created assignment ID: ${assignmentId}`);
          console.log(`  Assignment group: ${assignmentGroupName}`);
          console.log(
            `  Update canvas-config.json with: "lotteryAssignmentId": ${assignmentId}`
          );
          logChange(`ASSIGNMENT CREATED: "${assignmentName}" (ID: ${assignmentId}) in group "${assignmentGroupName}"`);
        }
      } catch (error) {
        logChange(`ERROR: Failed to create assignment for ${courseName}: ${error.message}`);
        return { success: false, error: error.message };
      }
    } else {
      // Assignment ID was provided in config, fetch its details for logging
      try {
        const assignment = await getAssignment(canvasId, assignmentId);
        assignmentName = assignment.name;
        assignmentGroupName = getGroupName(assignment.assignment_group_id);
        console.log(`\n--- Using Configured Assignment ---`);
        console.log(`  Assignment: "${assignmentName}" (ID: ${assignmentId})`);
        console.log(`  Assignment group: ${assignmentGroupName}`);
        logChange(`ASSIGNMENT: "${assignmentName}" (ID: ${assignmentId}) in group "${assignmentGroupName}"`);
      } catch (error) {
        console.log(`  Warning: Could not fetch assignment details: ${error.message}`);
        assignmentName = `Assignment ${assignmentId}`;
        assignmentGroupName = "Unknown";
      }
    }

    console.log("\n--- Submitting Grades to Canvas ---\n");

    const submittedGrades = [];

    for (const student of studentsWithGrades) {
      // Get individual entries for this student's point history
      const studentKey = student.lotteryName?.toUpperCase();
      const studentEntries = studentKey ? entriesByStudent.get(studentKey) || [] : [];

      const adjustmentNote = medianAdjustment > 0 ? ` [adjusted -${medianAdjustment}]` : "";
      const participation = computeParticipation(studentEntries, awardedPosts);
      const participationLine =
        participation.total > 0
          ? `\n🗣️ Slack participation: ${participation.responded} of ${participation.total} point-offer threads`
          : "";
      const comment = `🤖Lottery bot | Grade: ${student.grade}

📊 ${student.calls} calls, ${student.points} pts total | ${student.percentile.toFixed(1)}th %ile (median: ${stats.median} pts${adjustmentNote}, ${stats.medianCalls} calls)
📐 Formula: median=100, above=linear to 110, below=quadratic SD curve${participationLine}

📋 Point History:
${enrichPointHistory(studentEntries, postsByUrl)}`;

      try {
        await submitGrade(
          canvasId,
          assignmentId,
          student.canvasUserId,
          student.grade,
          comment
        );
        submitted++;
        submittedGrades.push({
          userId: student.canvasUserId,
          name: student.canvasName,
          grade: student.grade,
        });
        logChange(`GRADE: ${courseName} | ${student.canvasName} | ${student.grade} | ${student.points} pts | ${student.percentile.toFixed(1)}%ile`);
        if (verbose) {
          console.log(`  [OK] ${student.canvasName}: ${student.grade}`);
        }
      } catch (error) {
        errors++;
        logChange(`ERROR: ${courseName} | ${student.canvasName} | ${error.message}`);
        console.error(
          `  [ERROR] ${student.canvasName}: ${error.message}`
        );
      }
    }

    console.log(`\nSubmitted: ${submitted}, Errors: ${errors}`);

    // Step 8: Verify grades
    console.log("\n--- Verifying Grades ---\n");
    try {
      verification = await verifyGrades(canvasId, assignmentId, submittedGrades);
      console.log(`Verified ${verification.verified}/${verification.total} grades match`);
      logChange(`VERIFICATION: ${courseName} | ${verification.verified}/${verification.total} grades verified`);

      if (verification.mismatches.length > 0) {
        console.log("\nMismatches found:");
        for (const mismatch of verification.mismatches) {
          console.log(`  ${mismatch.name}: expected ${mismatch.expected}, got ${mismatch.actual}`);
          logChange(`MISMATCH: ${courseName} | ${mismatch.name} | expected ${mismatch.expected} | got ${mismatch.actual}`);
        }
      }
    } catch (error) {
      console.error("  Error verifying grades:", error.message);
      logChange(`ERROR: Verification failed for ${courseName}: ${error.message}`);
    }

    logChange(`EXPORT COMPLETED: ${courseName} | Assignment: "${assignmentName}" in "${assignmentGroupName}" | ${submitted} submitted | ${errors} errors`);
  } else {
    console.log("\n[DRY RUN] No grades submitted. Remove --dry-run to submit.");
  }

  return {
    success: true,
    courseName,
    stats,
    studentsWithGrades,
    unmatchedLottery,
    submitted,
    errors,
    verification,
  };
}

/**
 * Parse command line arguments
 */
function parseArgs(argv = process.argv.slice(2)) {
  const args = argv;
  const options = {
    courses: [],
    dryRun: false,
    all: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--course" || arg === "-c") {
      options.courses.push(args[++i]);
    } else if (arg === "--dry-run" || arg === "-d") {
      options.dryRun = true;
    } else if (arg === "--all" || arg === "-a") {
      options.all = true;
    } else if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
    } else if (arg === "--grade-type" || arg === "-g") {
      // Removed deliberately: this flag only ever chose the destination
      // assignment, never the submitted value, so "accumulated" posted the
      // curved grade to a column named for a raw tally. Fail loudly rather
      // than silently ignoring a flag someone's muscle memory still types.
      throw new Error(
        "--grade-type has been removed. Exports always submit the lottery grade; " +
          "the raw point total and class median are in the Canvas comment."
      );
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: node export-lottery-to-canvas.mjs [options]

Options:
  --course, -c <name>    Course to process (can be specified multiple times)
  --all, -a              Process all courses
  --dry-run, -d          Preview grades without submitting to Canvas
  --verbose, -v          Show detailed output for each submission
  --help, -h             Show this help message

Examples:
  npm run export_to_canvas -- --course my_course --dry-run
  npm run export_to_canvas -- --all
  npm run export_to_canvas -- -c my_course -v
`);
      process.exit(0);
    }
  }

  if (options.all) {
    options.courses = Object.keys(config.courses);
  }

  return options;
}

/**
 * Main entry point
 */
async function main() {
  const options = parseArgs();

  if (options.courses.length === 0) {
    console.error("Error: No courses specified. Use --course <name> or --all");
    console.log("Available courses:", Object.keys(config.courses).join(", "));
    process.exit(1);
  }

  console.log("Canvas Lottery Grade Export");
  console.log("===========================");
  console.log(`Courses: ${options.courses.join(", ")}`);
  console.log(`Dry run: ${options.dryRun}`);

  if (!process.env.CANVAS_TOKEN && !options.dryRun) {
    console.error("\nError: CANVAS_TOKEN environment variable is required.");
    console.log("Set it with: export CANVAS_TOKEN=your_token_here");
    console.log("Or run with --dry-run to preview without submitting.\n");
    // Continue anyway for dry-run mode
  }

  const results = [];

  for (const course of options.courses) {
    try {
      const result = await processCourse(course, {
        dryRun: options.dryRun,
        verbose: options.verbose,
      });
      results.push(result);
    } catch (error) {
      console.error(`\nError processing ${course}:`, error.message);
      results.push({ success: false, courseName: course, error: error.message });
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  for (const result of results) {
    const status = result.success ? "[OK]" : "[FAILED]";
    console.log(`${status} ${result.courseName || "Unknown"}`);
    if (!result.success) {
      console.log(`      Error: ${result.error}`);
    }
  }

  process.exit(results.every((r) => r.success) ? 0 : 1);
}

// Run CLI only when executed directly, not when imported for testing
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

// Exports for testing
export { MIN_CONFIDENCE, parseNameParts, scoreNameMatch, matchLotteryToCanvas, processCourse, computeGrade, parseArgs };
