# Slack Participation Points — Phase 0 + 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Canvas MCP project-local + remove Figma, wire the current Summer-2026 course into Canvas export, and build the ledger/menu/dedup/Canvas-enrichment foundation for Slack participation points.

**Architecture:** A new Mongo `lottery_<course>.slack_posts` collection is the backbone (dedup record + status/history + future training set). Pure formatting/participation logic lives in a testable `slack-checker/ledger-format.mjs`; Mongo I/O in `slack-checker/ledger.mjs`; config in `slack-checker/config.js`. `check-responses.mjs` gains an interactive menu (award-by-URL, add-by-URL, list-with-status) while keeping all existing flags. The Canvas export reads the ledger to render readable participation history.

**Tech Stack:** Node ESM, `mongodb` (v3 driver, already a dep), `@slack/web-api`, Jest (`--experimental-vm-modules`). No new dependencies in this plan (transformers.js arrives in Phase 2).

**Spec:** `docs/superpowers/specs/2026-06-10-slack-participation-points-design.md`

**Scope note:** This plan covers **Phase 0** (mechanical config) and **Phase 1** (ledger + menu + dedup + Canvas enrichment). Phase 2 (embeddings scan) and Phase 3 (setup wizard) are planned separately. The menu here implements items 2/3/4; items 1 (Scan) and 5 (Setup) render an explicit "coming soon" line until their phases land.

---

## Phase 0 — MCP rescope + current-semester config (mechanical, no tests)

### Task 0.1: Re-scope Canvas MCP to project; remove Figma

**Files:**
- Create: `/Users/aguerra/workspace/lotteryv2/.mcp.json`
- Modify: `~/.zshrc` (append exports)

- [ ] **Step 1: Capture the token/domain currently in use** (so the env exports match)

Run: `grep -E '^CANVAS_(TOKEN|DOMAIN)=' /Users/aguerra/workspace/lotteryv2/.env`
Expected: prints `CANVAS_TOKEN=14523~…` and `CANVAS_DOMAIN=northeastern.instructure.com`

- [ ] **Step 2: Append the env exports to `~/.zshrc`** (MCP expansion reads the launching shell's env; this keeps the token out of git)

```bash
cat >> ~/.zshrc <<'EOF'

# Canvas MCP (project-local .mcp.json expands these; token stays out of git)
export CANVAS_API_TOKEN="14523~nQEQBFmQhD2k8P979Ea84AvrURcMJxkL8N8AckRcFGZnLkfkF34HNVNGNZ2GhHBJ"
export CANVAS_DOMAIN="northeastern.instructure.com"
EOF
```

- [ ] **Step 3: Remove the global/account-scoped servers**

```bash
claude mcp remove canvas-lms -s user
claude mcp remove canvas-extras -s user
claude mcp remove "claude.ai Figma" -s claudeai
```
Expected: each prints a removal confirmation. (If Figma was already gone, the command reports it's not found — that's fine.)

- [ ] **Step 4: Create the project-scoped `.mcp.json`** (committed; contains only `${VAR}` refs, no secret)

```json
{
  "mcpServers": {
    "canvas-lms": {
      "command": "npx",
      "args": ["-y", "canvas-mcp-server@2.2.3"],
      "env": { "CANVAS_API_TOKEN": "${CANVAS_API_TOKEN}", "CANVAS_DOMAIN": "${CANVAS_DOMAIN}" }
    },
    "canvas-extras": {
      "command": "node",
      "args": ["/Users/aguerra/workspace/aiCoding_Course/tools/canvas-extras-mcp/index.js"],
      "env": { "CANVAS_API_TOKEN": "${CANVAS_API_TOKEN}", "CANVAS_DOMAIN": "${CANVAS_DOMAIN}" }
    }
  }
}
```

- [ ] **Step 5: Verify scope (requires a NEW shell so the exports + .mcp.json are picked up)**

Run (in a fresh terminal): `claude mcp get canvas-lms`
Expected: `Scope: Project config` and `Status: ✔ Connected`. Run `claude mcp list` and confirm no Figma entry.

- [ ] **Step 6: Commit**

```bash
git add .mcp.json
git commit -m "chore: project-scope Canvas MCP via env vars; remove Figma"
```

### Task 0.2: Add Summer-2026 course to Canvas export config

**Files:**
- Modify: `canvas-config.json` (gitignored — not committed)

- [ ] **Step 1: Add the `webdev_summer_2026` entry** under `"courses"` (IDs verified live: Canvas course 249954, Participation group 664838, existing "Lottery Grade" assignment 3196231)

```json
    "webdev_summer_2026": {
      "canvasId": 249954,
      "lotteryAssignmentId": 3196231,
      "accumulatedPointsAssignmentId": null,
      "participationGroupId": 664838
    }
```

- [ ] **Step 2: Verify the export resolves the new course end-to-end (dry run, no writes)**

Run: `yarn export_to_canvas -- --course webdev_summer_2026 --dry-run`
Expected: "Found 120 students with lottery entries", a Canvas enrollment count, a Grade Preview table, and "[DRY RUN] No grades submitted." No errors.

(No commit — `canvas-config.json` is gitignored.)

---

## Phase 1 — Ledger + menu + dedup + Canvas enrichment

### Task 1.1: Pure ledger-format helpers — URL extraction + snippet (TDD)

**Files:**
- Create: `slack-checker/ledger-format.mjs`
- Test: `slack-checker/__tests__/ledger-format.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import {
  extractThreadUrl,
  truncateSnippet,
} from "../ledger-format.mjs";

describe("extractThreadUrl()", () => {
  test("pulls the URL out of an award reason", () => {
    const reason = "Responded to Slack thread: https://t.slack.com/archives/C1/p1700000000000001";
    expect(extractThreadUrl(reason)).toBe(
      "https://t.slack.com/archives/C1/p1700000000000001"
    );
  });
  test("returns null for a non-Slack reason", () => {
    expect(extractThreadUrl("Points in class")).toBeNull();
  });
  test("returns null for empty/undefined", () => {
    expect(extractThreadUrl("")).toBeNull();
    expect(extractThreadUrl(undefined)).toBeNull();
  });
});

describe("truncateSnippet()", () => {
  test("collapses whitespace and keeps short text", () => {
    expect(truncateSnippet("hello   world")).toBe("hello world");
  });
  test("truncates with an ellipsis past max", () => {
    expect(truncateSnippet("abcdefghij", 5)).toBe("abcd…");
  });
  test("handles empty input", () => {
    expect(truncateSnippet("")).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test slack-checker/__tests__/ledger-format.test.mjs`
Expected: FAIL — "Cannot find module '../ledger-format.mjs'".

- [ ] **Step 3: Write the minimal implementation**

```js
// Pure formatting helpers for the Slack-post ledger (no I/O — unit testable).

const SLACK_THREAD_PREFIX = "Responded to Slack thread: ";

/** Extract the thread URL from a grade doc's reason string, or null. */
export function extractThreadUrl(reason) {
  if (!reason || !reason.startsWith(SLACK_THREAD_PREFIX)) return null;
  return reason.slice(SLACK_THREAD_PREFIX.length).trim();
}

/** Collapse whitespace and truncate post text to a short display snippet. */
export function truncateSnippet(text, max = 50) {
  if (!text) return "";
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : oneLine.slice(0, max - 1) + "…";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test slack-checker/__tests__/ledger-format.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add slack-checker/ledger-format.mjs slack-checker/__tests__/ledger-format.test.mjs
git commit -m "feat(slack): add ledger-format URL/snippet helpers"
```

### Task 1.2: Participation rate + enriched history (TDD)

**Files:**
- Modify: `slack-checker/ledger-format.mjs`
- Modify: `slack-checker/__tests__/ledger-format.test.mjs`

- [ ] **Step 1: Add failing tests**

```js
import {
  computeParticipation,
  enrichPointHistory,
} from "../ledger-format.mjs";

const url1 = "https://t.slack.com/archives/C1/p1";
const url2 = "https://t.slack.com/archives/C1/p2";

describe("computeParticipation()", () => {
  test("counts distinct awarded threads the student responded to", () => {
    const entries = [
      { reason: "Responded to Slack thread: " + url1, grade: 2, timestamp: "2026-06-03" },
      { reason: "Responded to Slack thread: " + url1, grade: 2, timestamp: "2026-06-03" }, // dup thread
      { reason: "Points in class", grade: 1, timestamp: "2026-06-04" },
    ];
    const awardedPosts = [{ url: url1 }, { url: url2 }];
    expect(computeParticipation(entries, awardedPosts)).toEqual({ responded: 1, total: 2 });
  });
  test("ignores threads not in the awarded set", () => {
    const entries = [{ reason: "Responded to Slack thread: " + url2, grade: 2, timestamp: "x" }];
    expect(computeParticipation(entries, [{ url: url1 }])).toEqual({ responded: 0, total: 1 });
  });
});

describe("enrichPointHistory()", () => {
  test("renders a Slack entry with channel + snippet from the ledger map", () => {
    const entries = [{ reason: "Responded to Slack thread: " + url1, grade: 2, timestamp: "2026-06-03T12:00:00Z" }];
    const postsByUrl = { [url1]: { channel: "#general", text: "Participation points if you reply" } };
    const out = enrichPointHistory(entries, postsByUrl);
    expect(out).toContain("(#general)");
    expect(out).toContain("Participation points if you reply");
    expect(out).toContain("+2 pts");
  });
  test("falls back to the raw reason for non-ledger entries", () => {
    const entries = [{ reason: "Points in class", grade: 1, timestamp: "2026-06-03T12:00:00Z" }];
    expect(enrichPointHistory(entries, {})).toContain("Points in class");
  });
  test("handles no entries", () => {
    expect(enrichPointHistory([], {})).toBe("  (No entries)");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn test slack-checker/__tests__/ledger-format.test.mjs`
Expected: FAIL — `computeParticipation`/`enrichPointHistory` are not exported.

- [ ] **Step 3: Implement (append to `slack-checker/ledger-format.mjs`)**

```js
/**
 * Participation counts for one student.
 * @param {Array<{reason:string}>} entries - the student's grade docs
 * @param {Array<{url:string}>} awardedPosts - awarded ledger docs for the course
 * @returns {{responded:number,total:number}}
 */
export function computeParticipation(entries, awardedPosts) {
  const awardedUrls = new Set(awardedPosts.map((p) => p.url));
  const respondedUrls = new Set();
  for (const e of entries) {
    const url = extractThreadUrl(e.reason);
    if (url && awardedUrls.has(url)) respondedUrls.add(url);
  }
  return { responded: respondedUrls.size, total: awardedUrls.size };
}

/**
 * Render readable point-history lines. Slack entries whose URL is in postsByUrl
 * show "Mon D (#chan): "snippet" +pts"; everything else keeps its reason.
 * @param {Array} entries
 * @param {Object<string,{channel:string,text:string}>} postsByUrl
 * @returns {string}
 */
export function enrichPointHistory(entries, postsByUrl) {
  if (!entries || entries.length === 0) return "  (No entries)";
  return entries
    .slice()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .map((e) => {
      const date = new Date(e.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const pts = e.grade > 0 ? `+${e.grade}` : `${e.grade}`;
      const url = extractThreadUrl(e.reason);
      const post = url ? postsByUrl[url] : null;
      if (post) {
        return `  • ${date} (${post.channel}): "${truncateSnippet(post.text)}" ${pts} pts`;
      }
      const reason = e.reason || "Points in class";
      return `  • ${date}: ${pts} pts - ${reason}`;
    })
    .join("\n");
}
```

- [ ] **Step 4: Run to verify pass**

Run: `yarn test slack-checker/__tests__/ledger-format.test.mjs`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add slack-checker/ledger-format.mjs slack-checker/__tests__/ledger-format.test.mjs
git commit -m "feat(slack): add participation rate + enriched history helpers"
```

### Task 1.3: Ledger Mongo I/O module

**Files:**
- Create: `slack-checker/ledger.mjs`

(I/O against local Mongo; verified manually, consistent with `db/myDB.js` connection style.)

- [ ] **Step 1: Write the module**

```js
// Mongo I/O for the per-course Slack-post ledger: lottery_<course>.slack_posts
import mongodb from "mongodb";

const { MongoClient } = mongodb;
const url = process.env.MONGO_URL || "mongodb://localhost:27017";

function postsCollection(client, course) {
  return client.db("lottery_" + course).collection("slack_posts");
}

/**
 * Upsert a post by threadTs. addedAt is set only on first insert.
 * @param {string} course
 * @param {{threadTs:string,url:string,channel:string,text:string,source:string,
 *          awarded?:boolean,points?:number,studentCount?:number,awardedAt?:Date}} post
 */
export async function recordPost(course, post) {
  const client = new MongoClient(url, { useUnifiedTopology: true });
  try {
    await client.connect();
    await postsCollection(client, course).updateOne(
      { threadTs: post.threadTs },
      { $set: post, $setOnInsert: { addedAt: new Date() } },
      { upsert: true }
    );
  } finally {
    await client.close();
  }
}

/** Mark a recorded post as awarded with point/student totals. */
export async function markAwarded(course, threadTs, { points, studentCount }) {
  const client = new MongoClient(url, { useUnifiedTopology: true });
  try {
    await client.connect();
    await postsCollection(client, course).updateOne(
      { threadTs },
      { $set: { awarded: true, points, studentCount, awardedAt: new Date() } }
    );
  } finally {
    await client.close();
  }
}

/** True if a post exists and is marked awarded. */
export async function isAwarded(course, threadTs) {
  const client = new MongoClient(url, { useUnifiedTopology: true });
  try {
    await client.connect();
    const doc = await postsCollection(client, course).findOne({ threadTs });
    return !!(doc && doc.awarded);
  } finally {
    await client.close();
  }
}

/** All ledger docs for a course, newest first. */
export async function getPosts(course) {
  const client = new MongoClient(url, { useUnifiedTopology: true });
  try {
    await client.connect();
    return await postsCollection(client, course).find({}).sort({ addedAt: -1 }).toArray();
  } finally {
    await client.close();
  }
}

/** Only the awarded posts (used for participation totals). */
export async function getAwardedPosts(course) {
  const posts = await getPosts(course);
  return posts.filter((p) => p.awarded);
}

/** Reference texts for the future embeddings classifier (all confirmed offers). */
export async function getReferenceTexts(course) {
  const posts = await getPosts(course);
  return posts.map((p) => p.text).filter(Boolean);
}
```

- [ ] **Step 2: Smoke-test against local Mongo**

Run:
```bash
node --input-type=module -e '
import { recordPost, markAwarded, isAwarded, getPosts } from "./slack-checker/ledger.mjs";
const c = "lottery_tests";
await recordPost(c, { threadTs: "p_demo", url: "u", channel: "#x", text: "demo offer", source: "manual", awarded: false });
await markAwarded(c, "p_demo", { points: 2, studentCount: 3 });
console.log("isAwarded:", await isAwarded(c, "p_demo"));
console.log("posts:", (await getPosts(c)).map(p => ({ threadTs: p.threadTs, awarded: p.awarded, points: p.points })));
'
```
Expected: `isAwarded: true` and a posts array containing `{ threadTs: "p_demo", awarded: true, points: 2 }`.

- [ ] **Step 3: Clean up the demo doc**

Run:
```bash
mongosh --quiet lottery_lottery_tests --eval 'db.slack_posts.deleteOne({threadTs:"p_demo"}); print("cleaned")'
```
Expected: `cleaned`. (Note the DB is `lottery_` + course = `lottery_lottery_tests`.)

- [ ] **Step 4: Commit**

```bash
git add slack-checker/ledger.mjs
git commit -m "feat(slack): add slack_posts ledger Mongo module"
```

### Task 1.4: Slack scan/config loader + gitignore

**Files:**
- Create: `slack-checker/config.js`
- Create: `slack-checker/config.example.json`
- Modify: `.gitignore`

- [ ] **Step 1: Add the real (gitignored) config with the current course**

Create `slack-checker/config.json`:
```json
{
  "webdev_summer_2026": {
    "channels": ["#general", "#announcements", "#classchat"],
    "semesterStart": "2026-05-04",
    "semesterEnd": "2026-08-21",
    "instructorSlackId": "",
    "seedOfferPhrases": [
      "I'll give participation points to everyone who responds in this thread",
      "Lottery points if you reply here before tomorrow"
    ]
  }
}
```
(`instructorSlackId` left blank for now; Phase 3 setup wizard fills it. Phase 2 falls back to scanning all top-level messages when blank.)

- [ ] **Step 2: Add a committed example so the shape is documented**

Create `slack-checker/config.example.json` with the same content as Step 1 but a placeholder course key `"<course_key>"` and `"instructorSlackId": "U0000000000"`.

- [ ] **Step 3: Gitignore the real config**

Add to `.gitignore` under the "Canvas config" section:
```
# Slack scan config (channels, term dates, instructor id)
slack-checker/config.json
```

- [ ] **Step 4: Write the loader**

Create `slack-checker/config.js`:
```js
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "config.json");

/** Parsed config object keyed by course, or {} if the file is missing. */
export function loadAllScanConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

/** Config for one course, or null if absent. */
export function loadScanConfig(course) {
  return loadAllScanConfig()[course] || null;
}
```

- [ ] **Step 5: Verify it loads**

Run: `node --input-type=module -e 'import { loadScanConfig } from "./slack-checker/config.js"; console.log(loadScanConfig("webdev_summer_2026"));'`
Expected: prints the object with `channels`, `semesterStart`, etc.

- [ ] **Step 6: Commit** (config.json is gitignored and will not be added)

```bash
git add slack-checker/config.js slack-checker/config.example.json .gitignore
git commit -m "feat(slack): add scan config loader + example + gitignore"
```

### Task 1.5: Extract the award flow into a reusable function with ledger recording

**Files:**
- Modify: `slack-checker/check-responses.mjs`

Currently `main()` (lines 152-337) parses args and runs the entire fetch→match→confirm→award flow inline. Extract the post-parse work into `awardFromThread(options)` so both the CLI and the new menu can call it, and record results in the ledger.

- [ ] **Step 1: Add imports at the top of `check-responses.mjs`** (after the existing `matcher.mjs` import on line 30)

```js
import { recordPost, markAwarded, isAwarded } from "./ledger.mjs";
import { loadScanConfig } from "./config.js";
```

- [ ] **Step 2: Create `awardFromThread()` by moving the body of `main()` from line 180 (`console.log(\`Checking thread...\`)`) through the end of the award loop (line 336) into a new function.** Replace the old inline body; `main()` will call this (wired in Task 1.7). Signature and the new ledger lines:

```js
/**
 * Run the full fetch → match → preview → confirm → award flow for one thread.
 * @param {{threadUrl:string,course:string,points:number,hours:number,
 *          dryRun:boolean,skipConfirm:boolean,topUp?:boolean}} options
 * @returns {Promise<{awarded:number, threadTs:string|null}>}
 */
export async function awardFromThread(options) {
  // Dedup guard: skip an already-awarded post unless topping up new responders.
  let parsed;
  try {
    parsed = parseSlackUrl(options.threadUrl);
  } catch (error) {
    console.error(error.message);
    return { awarded: 0, threadTs: null };
  }
  if (!options.dryRun && !options.topUp && (await isAwarded(options.course, parsed.messageTs))) {
    console.log(
      `\nThis post is already awarded for ${options.course}. ` +
        `Re-run with the "top-up new responders" option to add only new repliers.`
    );
    return { awarded: 0, threadTs: parsed.messageTs };
  }

  // --- existing flow moved here (lines 180-336 of the original main) ---
  // KEEP every console.log, the getParentMessage/getThreadReplies calls, the
  // cutoff math, matchNames, the SUMMARY block, dry-run early return, and the
  // confirmation prompt EXACTLY as they were, with these substitutions:
  //   * use `options.threadUrl/course/points/hours/dryRun/skipConfirm` (the
  //     code already reads from an `options` object, so no rename needed).
  //   * reuse `channelId, messageTs` from `parsed` instead of re-parsing.
  //   * track the awarded count in `awardedCount` (already present).
  // Then, immediately AFTER the award loop completes, record the ledger:

  if (!options.dryRun && awardedCount > 0) {
    await recordPost(options.course, {
      threadTs: parsed.messageTs,
      url: options.threadUrl,
      channel: parentMessage.channel || "",
      text: parentMessage.text || "",
      source: "award",
      awarded: true,
    });
    await markAwarded(options.course, parsed.messageTs, {
      points: options.points,
      studentCount: awardedCount,
    });
  }

  return { awarded: awardedCount, threadTs: parsed.messageTs };
}
```

Note: `getParentMessage` returns the raw message object; it does not include `channel`. Capture the channel from `parsed.channelId` instead — set `channel: parsed.channelId` in `recordPost` (the human "#name" is resolved later in Phase 2's `listChannels`; storing the ID is correct and stable now). Update the `recordPost` call's `channel` field to `parsed.channelId`.

- [ ] **Step 3: Verify the file still parses and CLI dry-run still works** (full wiring in 1.7; this checks the extraction didn't break syntax)

Run: `node -c slack-checker/check-responses.mjs && echo "parse OK"`
Expected: `parse OK`.

- [ ] **Step 4: Commit**

```bash
git add slack-checker/check-responses.mjs
git commit -m "refactor(slack): extract awardFromThread() with ledger recording"
```

### Task 1.6: Add menu actions (award / add-by-URL / list) + dedup top-up

**Files:**
- Modify: `slack-checker/check-responses.mjs`

- [ ] **Step 1: Add a small prompt helper next to the existing `confirm()`** (which uses `createInterface`)

```js
/** Prompt for a line of input, returning the trimmed answer (or fallback). */
async function ask(message, fallback = "") {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      const trimmed = (answer || "").trim();
      resolve(trimmed === "" ? fallback : trimmed);
    });
  });
}
```

- [ ] **Step 2: Add `pickCourse()` using the roster course list**

```js
import { getAvailableCourses } from "./matcher.mjs"; // already imported in Task 1.5 batch? ensure present

/** Show a numbered course list and return the chosen course key. */
async function pickCourse() {
  const courses = getAvailableCourses();
  console.log("\nCourses:");
  courses.forEach((c, i) => console.log(`  ${i + 1}) ${c}`));
  const choice = await ask("Pick a course (number): ");
  const idx = parseInt(choice, 10) - 1;
  return courses[idx] || null;
}
```
(If `getAvailableCourses` is already imported via the existing `matcher.mjs` import line, add it to that import instead of duplicating.)

- [ ] **Step 3: Add the interactive award action**

```js
/** Menu action: award points from a thread URL (prompts for missing values). */
async function menuAwardFromUrl() {
  const threadUrl = await ask("Slack thread URL: ");
  if (!threadUrl) return console.log("No URL given.");
  const course = await pickCourse();
  if (!course) return console.log("No course selected.");
  const points = parseInt(await ask("Points per responder [2]: ", "2"), 10);
  const hours = parseFloat(await ask(`Time window in hours [${DEFAULT_HOURS}]: `, String(DEFAULT_HOURS)));
  const topUp = (await ask("Top-up new responders only if already awarded? (y/N): ", "n"))
    .toLowerCase()
    .startsWith("y");
  await awardFromThread({ threadUrl, course, points, hours, dryRun: false, skipConfirm: false, topUp });
}
```

- [ ] **Step 4: Add the "add by URL (teach)" action** (records the post as a reference example without necessarily awarding)

```js
/** Menu action: record a post by URL so its text seeds the scanner; optional award. */
async function menuAddByUrl() {
  const threadUrl = await ask("Slack thread URL to add: ");
  if (!threadUrl) return console.log("No URL given.");
  const course = await pickCourse();
  if (!course) return console.log("No course selected.");
  let parsed;
  try {
    parsed = parseSlackUrl(threadUrl);
  } catch (error) {
    return console.error(error.message);
  }
  const parent = await getParentMessage(parsed.channelId, parsed.messageTs);
  await recordPost(course, {
    threadTs: parsed.messageTs,
    url: threadUrl,
    channel: parsed.channelId,
    text: parent.text || "",
    source: "manual",
    awarded: false,
  });
  console.log(`\nRecorded as a reference example:\n  "${(parent.text || "").slice(0, 80)}"`);
  const alsoAward = (await ask("Award points for this post now? (y/N): ", "n")).toLowerCase().startsWith("y");
  if (alsoAward) {
    const points = parseInt(await ask("Points per responder [2]: ", "2"), 10);
    const hours = parseFloat(await ask(`Time window in hours [${DEFAULT_HOURS}]: `, String(DEFAULT_HOURS)));
    await awardFromThread({ threadUrl, course, points, hours, dryRun: false, skipConfirm: false });
  }
}
```

- [ ] **Step 5: Add the "list posts & status" action**

```js
import { getPosts } from "./ledger.mjs"; // add to the existing ledger import from Task 1.5

/** Menu action: print every known post for a course with its grading status. */
async function menuListPosts() {
  const course = await pickCourse();
  if (!course) return console.log("No course selected.");
  const posts = await getPosts(course);
  if (posts.length === 0) return console.log("\nNo posts recorded for this course yet.");
  console.log(`\nPosts for ${course}:\n`);
  console.log("Date".padEnd(12) + "Status".padEnd(10) + "Pts".padStart(4) + "  " + "Stud".padStart(4) + "  Post");
  console.log("-".repeat(72));
  for (const p of posts) {
    const when = p.awardedAt ? new Date(p.awardedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : (p.addedAt ? new Date(p.addedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");
    const status = p.awarded ? "awarded" : "added";
    const pts = p.awarded ? String(p.points ?? "") : "";
    const stud = p.awarded ? String(p.studentCount ?? "") : "";
    const snippet = (p.text || "").replace(/\s+/g, " ").slice(0, 40);
    console.log(when.padEnd(12) + status.padEnd(10) + pts.padStart(4) + "  " + stud.padStart(4) + "  " + snippet);
  }
}
```

- [ ] **Step 6: Verify the file parses**

Run: `node -c slack-checker/check-responses.mjs && echo "parse OK"`
Expected: `parse OK`.

- [ ] **Step 7: Commit**

```bash
git add slack-checker/check-responses.mjs
git commit -m "feat(slack): add interactive menu actions (award/add/list) + top-up"
```

### Task 1.7: Wire the top-level menu into `main()`

**Files:**
- Modify: `slack-checker/check-responses.mjs:152-164` (the start of `main()`)

- [ ] **Step 1: Replace the early-return-on-missing-args block** so missing args + TTY shows the menu; flags still work

Current (after Task 1.5, `main()` parses args then calls `awardFromThread`). Replace the `if (!options.threadUrl || !options.course) { printUsage(); process.exit(1); }` block with:

```js
  // No required args on an interactive terminal → show the menu.
  if ((!options.threadUrl || !options.course) && process.stdin.isTTY) {
    await runMenu();
    process.exit(0);
  }
  // Non-interactive (or scripted) with missing args → usage and exit.
  if (!options.threadUrl || !options.course) {
    printUsage();
    process.exit(1);
  }
  // Flags/positional args provided → run directly (existing behavior).
  await awardFromThread(options);
  process.exit(0);
```

- [ ] **Step 2: Add the `runMenu()` dispatcher** (Scan/Setup are stubs until Phases 2/3)

```js
/** Top-level interactive menu. */
async function runMenu() {
  console.log("\n=== Slack Participation Points ===");
  console.log("  1) Scan for new point-offer posts        (coming soon)");
  console.log("  2) Award points from a thread URL");
  console.log("  3) Add post by URL (teach the scanner)");
  console.log("  4) List posts & grading status");
  console.log("  5) Semester setup / fix config           (coming soon)");
  const choice = await ask("\nChoose an option (1-5): ");
  switch (choice) {
    case "2": return menuAwardFromUrl();
    case "3": return menuAddByUrl();
    case "4": return menuListPosts();
    case "1":
    case "5":
      return console.log("That option arrives in a later update.");
    default:
      return console.log("Unknown option.");
  }
}
```

- [ ] **Step 3: Verify CLI path still works (dry-run, no menu, no writes)**

Run: `yarn check-slack -- --dry-run "https://example.slack.com/archives/C123ABC/p1700000000000001" webdev_summer_2026 2`
Expected: the existing dry-run output (parent fetch may error if the bot can't see that test channel — that's fine; the point is the menu is bypassed and flags are parsed). To validate parsing only without Slack calls, confirm the first lines print `Course: webdev_summer_2026` and `Points per responder: 2`.

- [ ] **Step 4: Verify the menu appears with no args**

Run: `echo "4" | yarn check-slack` then, when it asks for a course, the piped input ends — so instead run interactively in a terminal: `yarn check-slack`, choose `4`, pick the course, and confirm the (likely empty) posts table renders.
Expected: the menu lists options 1-5; choosing 4 reaches the posts listing.

- [ ] **Step 5: Run the full test suite**

Run: `yarn test`
Expected: all suites pass (existing `matcher`, `canvas-matching`, and new `ledger-format`).

- [ ] **Step 6: Commit**

```bash
git add slack-checker/check-responses.mjs
git commit -m "feat(slack): interactive top-level menu with flag fallback"
```

### Task 1.8: Canvas export — enrich comments with ledger + participation rate

**Files:**
- Modify: `export-lottery-to-canvas.mjs` (import + replace the comment's history block at lines 832-843)

- [ ] **Step 1: Add imports near the top of `export-lottery-to-canvas.mjs`** (after the `classes` import on line 13)

```js
import { enrichPointHistory, computeParticipation } from "./slack-checker/ledger-format.mjs";
import { getAwardedPosts } from "./slack-checker/ledger.mjs";
```

- [ ] **Step 2: Load the ledger once per course inside `processCourse`**, right after `lotteryCounts` is fetched (after line 564). Build a URL→post map for fast lookup:

```js
  // Slack-post ledger for readable participation history (empty if none yet).
  let awardedPosts = [];
  let postsByUrl = {};
  try {
    awardedPosts = await getAwardedPosts(courseName);
    postsByUrl = Object.fromEntries(awardedPosts.map((p) => [p.url, p]));
  } catch (error) {
    console.log("  Note: could not load Slack ledger:", error.message);
  }
```

- [ ] **Step 3: Replace the comment construction (lines 836-843) to use the enriched history + participation line**

```js
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
```

- [ ] **Step 4: Verify the enriched export runs (dry-run; ledger may be empty → falls back to plain history)**

Run: `yarn export_to_canvas -- --course webdev_summer_2026 --dry-run --verbose`
Expected: runs to completion, prints the grade preview. (Comments are only shown on live submit, but the run must not error on the new imports/logic. If you have awarded a Slack post via the menu first, the per-student comment in a live run would show the "🗣️ Slack participation" line.)

- [ ] **Step 5: Run the full test suite once more**

Run: `yarn test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add export-lottery-to-canvas.mjs
git commit -m "feat(canvas): enrich grade comments with Slack participation + history"
```

---

## Self-Review

**Spec coverage (Phase 0+1 portions):**
- MCP rescope + Figma removal → Task 0.1 ✓
- Current-semester `canvas-config.json` → Task 0.2 ✓
- `slack_posts` ledger (dedup/status/training) → Tasks 1.1–1.3 ✓
- Config (`slack-checker/config.json`) → Task 1.4 ✓
- Menu (items 2/3/4 live; 1/5 stubbed for Phases 2/3) → Tasks 1.6–1.7 ✓
- Dedup (skip-already-awarded + top-up) → Tasks 1.5 (`isAwarded` guard), 1.6 (top-up prompt) ✓
- Canvas enrichment + participation rate → Task 1.8 ✓
- "Add by URL to teach" + "list with status" → Task 1.6 ✓
- Deferred to later plans: Phase 2 scan (`embeddings.mjs`, `slack-api` history), Phase 3 setup wizard. ✓ (explicitly out of scope here)

**Type/name consistency:** `recordPost/markAwarded/isAwarded/getPosts/getAwardedPosts/getReferenceTexts` (ledger.mjs) used consistently in Tasks 1.5/1.6/1.8. `enrichPointHistory(entries, postsByUrl)` and `computeParticipation(entries, awardedPosts)` signatures match between definition (1.1/1.2) and use (1.8). `awardFromThread(options)` shape matches its callers (1.6/1.7). Ledger `channel` stores the Slack channel ID in Phase 1 (human "#name" resolution is a Phase 2 concern) — noted in Task 1.5 Step 2.

**Placeholder scan:** No TBD/TODO; Task 1.5 Step 2 intentionally relocates an existing, already-written code block (lines 180-336) rather than reprinting 156 lines verbatim, and specifies the exact substitutions + new ledger lines. `instructorSlackId` is intentionally blank in config (documented behavior, not a placeholder bug).
