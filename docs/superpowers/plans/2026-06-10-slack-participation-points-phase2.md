# Slack Participation Points — Phase 2 Implementation Plan (Semantic Scan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Scan configured Slack channels over the semester window, use a local sentence-embedding model to flag the instructor's "offer of participation/lottery points" posts (learning from past awarded/added posts), mark which are already awarded, and let the user award any of them — wired into menu option 1.

**Architecture:** A new pure-ish `embeddings.mjs` wraps transformers.js (local, free). `slack-api.mjs` gains channel listing, paginated history, and permalink lookup. A `scan.mjs` orchestrator ties config + history + embeddings + ledger into a list of ranked candidates (with `alreadyAwarded` flags). `check-responses.mjs` gets a `menuScanOffers()` action wired into `runMenu` option 1 (replacing the "coming soon" stub). Reuses `awardFromThread()` from Phase 1 for the award step.

**Tech Stack:** Node ESM, `@huggingface/transformers` (transformers.js v3, model `Xenova/all-MiniLM-L6-v2`, ~23MB, downloaded once then offline), `@slack/web-api`, Jest.

**Spec:** `docs/superpowers/specs/2026-06-10-slack-participation-points-design.md` (Phase 2 section).
**Builds on:** Phase 0+1 (ledger.mjs, ledger-format.mjs, config.js, awardFromThread, runMenu) — already merged on this branch.

**Decisions for this phase:**
- URLs for discovered posts come from Slack `chat.getPermalink` (no workspace-domain guessing).
- When `instructorSlackId` is blank in config, scan ALL top-level messages in the window (Phase 3 captures the id). Log how many messages were embedded.
- Similarity threshold lives in config as `offerThreshold` (default 0.55); cosine over mean-pooled, L2-normalized embeddings (so cosine == dot product).
- Cold start (empty ledger) uses `seedOfferPhrases` from config as the reference set.

---

### Task 2.1: Add the transformers.js dependency

**Files:** Modify `package.json` (+ lockfile via yarn).

- [ ] **Step 1: Install the package**

Run: `yarn add @huggingface/transformers`
Expected: adds `@huggingface/transformers` to `dependencies` in `package.json`; `yarn.lock` updates; exit 0.

- [ ] **Step 2: Verify it imports and the model can load (downloads ~23MB on first run; needs network ONCE)**

Run:
```bash
node --input-type=module -e '
import { pipeline } from "@huggingface/transformers";
const ex = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
const out = await ex(["hello world"], { pooling: "mean", normalize: true });
const vec = out.tolist()[0];
console.log("dims:", vec.length, "len~1:", Math.abs(Math.hypot(...vec) - 1) < 1e-3);
'
```
Expected: `dims: 384 len~1: true` (384-dim, L2-normalized). If the package's API differs (e.g. import path or output accessor), STOP and report — do not guess; adapt Task 2.2 to the real API.

- [ ] **Step 3: Commit**

```bash
git add package.json yarn.lock
git commit -m "build: add @huggingface/transformers for local sentence embeddings"
```

---

### Task 2.2: `embeddings.mjs` — cosine + classifier (TDD for pure parts)

**Files:** Create `slack-checker/embeddings.mjs`, `slack-checker/__tests__/embeddings.test.mjs`.

- [ ] **Step 1: Write failing tests for the PURE helpers** (`slack-checker/__tests__/embeddings.test.mjs`)

```js
import { cosineSim, maxCosineToAny } from "../embeddings.mjs";

describe("cosineSim()", () => {
  test("identical vectors → 1", () => {
    expect(cosineSim([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
  });
  test("orthogonal vectors → 0", () => {
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  test("opposite vectors → -1", () => {
    expect(cosineSim([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });
  test("zero vector → 0 (no NaN)", () => {
    expect(cosineSim([0, 0], [1, 1])).toBe(0);
  });
});

describe("maxCosineToAny()", () => {
  test("returns the best similarity across references", () => {
    const vec = [1, 0];
    const refs = [[0, 1], [0.8, 0.2], [1, 0]];
    expect(maxCosineToAny(vec, refs)).toBeCloseTo(1, 6);
  });
  test("returns 0 when there are no references", () => {
    expect(maxCosineToAny([1, 0], [])).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn test slack-checker/__tests__/embeddings.test.mjs`
Expected: FAIL — cannot find module / not exported.

- [ ] **Step 3: Implement `slack-checker/embeddings.mjs`**

```js
// Local, offline sentence embeddings (transformers.js) + cosine helpers.
// Model is downloaded once (~23MB) then cached under the HF cache dir.
import { pipeline } from "@huggingface/transformers";

const MODEL = "Xenova/all-MiniLM-L6-v2";
let _embedderPromise = null;

/** Lazily load (and cache) the feature-extraction pipeline. */
export function getEmbedder() {
  if (!_embedderPromise) {
    _embedderPromise = pipeline("feature-extraction", MODEL);
  }
  return _embedderPromise;
}

/**
 * Embed an array of strings → array of number[] (mean-pooled, L2-normalized,
 * so cosine similarity equals the dot product). Returns [] for empty input.
 */
export async function embed(texts) {
  if (!texts || texts.length === 0) return [];
  const embedder = await getEmbedder();
  const output = await embedder(texts, { pooling: "mean", normalize: true });
  return output.tolist();
}

/** Cosine similarity of two equal-length numeric vectors; 0 if either is zero. */
export function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Highest cosine similarity of `vec` against any vector in `refVecs` (0 if none). */
export function maxCosineToAny(vec, refVecs) {
  let best = 0;
  for (const r of refVecs) {
    const s = cosineSim(vec, r);
    if (s > best) best = s;
  }
  return best;
}

/**
 * Classify candidate messages as point-offers by semantic similarity to known
 * offer examples.
 * @param {Array<{text:string}>} messages
 * @param {string[]} referenceTexts - example offer posts (ledger + seed phrases)
 * @param {number} threshold - cosine cutoff (default 0.55)
 * @returns {Promise<Array<{message:object, score:number}>>} sorted by score desc,
 *          only messages with score >= threshold. Empty if no references/messages.
 */
export async function classifyOffers(messages, referenceTexts, threshold = 0.55) {
  if (!messages?.length || !referenceTexts?.length) return [];
  const refVecs = await embed(referenceTexts);
  const msgVecs = await embed(messages.map((m) => m.text || ""));
  const scored = messages.map((message, i) => ({
    message,
    score: maxCosineToAny(msgVecs[i], refVecs),
  }));
  return scored
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 4: Run pure-helper tests to verify pass**

Run: `yarn test slack-checker/__tests__/embeddings.test.mjs`
Expected: PASS (6 tests). (These don't load the model — they only test `cosineSim`/`maxCosineToAny`.)

- [ ] **Step 5: Smoke-test the real embedding semantics (loads the model)**

Run:
```bash
node --input-type=module -e '
import { classifyOffers } from "./slack-checker/embeddings.mjs";
const refs = ["I will give participation points to everyone who replies in this thread"];
const msgs = [
  { text: "Reply here and you all get lottery points for participating" },
  { text: "The cafeteria is closed on Friday" },
];
const hits = await classifyOffers(msgs, refs, 0.4);
console.log(hits.map(h => ({ score: +h.score.toFixed(3), text: h.message.text.slice(0, 40) })));
'
```
Expected: the participation-points message is returned with a clearly higher score than (and the cafeteria message excluded or far lower than) the offer; confirms semantic matching works. (First run downloads the model.)

- [ ] **Step 6: Commit**

```bash
git add slack-checker/embeddings.mjs slack-checker/__tests__/embeddings.test.mjs
git commit -m "feat(slack): add local embeddings classifier (transformers.js)"
```

---

### Task 2.3: `slack-api.mjs` — channel list, history, permalink

**Files:** Modify `slack-checker/slack-api.mjs`.

- [ ] **Step 1: Append three exported functions** (use the existing module `client` and error style):

```js
/**
 * List public channels as a Map of "#name" → channel id (paginated).
 * Requires the bot token to have channels:read.
 */
export async function listChannels() {
  const map = new Map();
  let cursor;
  do {
    const res = await client.conversations.list({
      types: "public_channel",
      limit: 1000,
      exclude_archived: true,
      cursor,
    });
    if (!res.ok) throw new Error(`Slack API error: ${res.error}`);
    for (const c of res.channels) map.set(`#${c.name}`, c.id);
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return map;
}

/**
 * Fetch top-level messages in a channel within [oldest, latest] (unix seconds,
 * as strings). Paginated. The bot must be a member of the channel.
 * @returns {Promise<Array>} message objects (parents only; no thread replies)
 */
export async function getChannelHistory(channelId, { oldest, latest } = {}) {
  const messages = [];
  let cursor;
  do {
    const res = await client.conversations.history({
      channel: channelId,
      oldest,
      latest,
      limit: 200,
      cursor,
    });
    if (!res.ok) throw new Error(`Slack API error: ${res.error}`);
    for (const m of res.messages) {
      // Keep genuine top-level user messages with text; skip joins/bots/etc.
      if (m.type === "message" && !m.subtype && m.text) messages.push(m);
    }
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return messages;
}

/** Get the canonical permalink URL for a message (used to award it later). */
export async function getPermalink(channelId, messageTs) {
  const r = await client.chat.getPermalink({ channel: channelId, message_ts: messageTs });
  if (!r.ok) throw new Error(`Slack API error: ${r.error}`);
  return r.permalink;
}
```

- [ ] **Step 2: Update the dynamic import in `check-responses.mjs`** so these are available. Find the line:
```js
const { parseSlackUrl, getThreadReplies, getParentMessage, getUserDisplayNames } = await import("./slack-api.mjs");
```
and add the three new names:
```js
const { parseSlackUrl, getThreadReplies, getParentMessage, getUserDisplayNames, listChannels, getChannelHistory, getPermalink } = await import("./slack-api.mjs");
```

- [ ] **Step 3: Verify parse + import**

Run: `node -c slack-checker/slack-api.mjs && node -c slack-checker/check-responses.mjs && echo "parse OK"`
Expected: `parse OK`.

- [ ] **Step 4: Commit**

```bash
git add slack-checker/slack-api.mjs slack-checker/check-responses.mjs
git commit -m "feat(slack): add listChannels/getChannelHistory/getPermalink"
```

---

### Task 2.4: Scan orchestrator with a testable date→unix helper

**Files:** Create `slack-checker/scan.mjs`, `slack-checker/__tests__/scan.test.mjs`.

- [ ] **Step 1: Write a failing test for the pure helper** (`slack-checker/__tests__/scan.test.mjs`)

```js
import { toUnixSeconds, buildReferenceTexts } from "../scan.mjs";

describe("toUnixSeconds()", () => {
  test("converts a YYYY-MM-DD date to a unix-seconds string", () => {
    // 2026-05-04T00:00:00Z = 1777939200
    expect(toUnixSeconds("2026-05-04")).toBe("1777939200");
  });
  test("returns undefined for empty input", () => {
    expect(toUnixSeconds("")).toBeUndefined();
    expect(toUnixSeconds(undefined)).toBeUndefined();
  });
});

describe("buildReferenceTexts()", () => {
  test("combines ledger texts with seed phrases, de-duped, dropping empties", () => {
    const out = buildReferenceTexts(["offer A", "offer B", ""], ["seed 1", "offer A"]);
    expect(out.sort()).toEqual(["offer A", "offer B", "seed 1"].sort());
  });
  test("handles missing inputs", () => {
    expect(buildReferenceTexts(undefined, undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `yarn test slack-checker/__tests__/scan.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `slack-checker/scan.mjs`**

```js
// Orchestrates: config → channel history → embeddings classifier → ledger flags.
import { loadScanConfig } from "./config.js";
import { getReferenceTexts, getPosts } from "./ledger.mjs";
import { classifyOffers } from "./embeddings.mjs";

/** Convert a "YYYY-MM-DD" date to a unix-seconds string, or undefined. */
export function toUnixSeconds(dateStr) {
  if (!dateStr) return undefined;
  return String(Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000));
}

/** Merge ledger reference texts with seed phrases; de-dupe, drop empties. */
export function buildReferenceTexts(ledgerTexts, seedPhrases) {
  const set = new Set();
  for (const t of [...(ledgerTexts || []), ...(seedPhrases || [])]) {
    const trimmed = (t || "").trim();
    if (trimmed) set.add(trimmed);
  }
  return [...set];
}

/**
 * Run a scan for a course. Returns ranked candidate offer-posts, each annotated
 * with whether it's already in the ledger / awarded.
 * @param {string} course
 * @param {{listChannels:Function, getChannelHistory:Function, getPermalink:Function}} slack
 *        - injected Slack API functions (from slack-api.mjs)
 * @returns {Promise<{candidates:Array, embeddedCount:number, channelsScanned:string[]}>}
 */
export async function scanOffers(course, slack) {
  const cfg = loadScanConfig(course);
  if (!cfg) throw new Error(`No scan config for "${course}". Add it to slack-checker/config.json.`);

  const channelMap = await slack.listChannels();
  const oldest = toUnixSeconds(cfg.semesterStart);
  const latest = toUnixSeconds(cfg.semesterEnd);

  const channelsScanned = [];
  let candidates = [];
  for (const name of cfg.channels || []) {
    const channelId = channelMap.get(name);
    if (!channelId) {
      console.log(`  Skipping ${name}: channel not found (is the bot a member?).`);
      continue;
    }
    channelsScanned.push(name);
    let history;
    try {
      history = await slack.getChannelHistory(channelId, { oldest, latest });
    } catch (error) {
      console.log(`  Skipping ${name}: ${error.message}`);
      continue;
    }
    const filtered = cfg.instructorSlackId
      ? history.filter((m) => m.user === cfg.instructorSlackId)
      : history;
    for (const m of filtered) {
      candidates.push({ name, channelId, ts: m.ts, text: m.text });
    }
  }

  const embeddedCount = candidates.length;
  const refs = buildReferenceTexts(await getReferenceTexts(course), cfg.seedOfferPhrases);
  if (refs.length === 0) {
    return { candidates: [], embeddedCount, channelsScanned, noReferences: true };
  }

  const threshold = cfg.offerThreshold ?? 0.55;
  const hits = await classifyOffers(candidates, refs, threshold);

  // Annotate with ledger status (awarded / already recorded) by threadTs (= ts).
  const ledger = await getPosts(course);
  const byTs = new Map(ledger.map((p) => [p.threadTs, p]));
  const annotated = [];
  for (const hit of hits) {
    const { name, channelId, ts, text } = hit.message;
    const existing = byTs.get(ts);
    annotated.push({
      channel: name,
      channelId,
      ts,
      text,
      score: hit.score,
      alreadyAwarded: !!(existing && existing.awarded),
      inLedger: !!existing,
    });
  }
  return { candidates: annotated, embeddedCount, channelsScanned };
}
```

- [ ] **Step 4: Run the pure-helper tests to verify pass**

Run: `yarn test slack-checker/__tests__/scan.test.mjs`
Expected: PASS (4 tests). (These exercise only `toUnixSeconds`/`buildReferenceTexts`; `scanOffers` is integration-tested manually in Task 2.5.)

- [ ] **Step 5: Commit**

```bash
git add slack-checker/scan.mjs slack-checker/__tests__/scan.test.mjs
git commit -m "feat(slack): add scan orchestrator (config+history+embeddings+ledger)"
```

---

### Task 2.5: `menuScanOffers()` + wire into menu option 1

**Files:** Modify `slack-checker/check-responses.mjs`.

- [ ] **Step 1: Add imports** near the other imports (the slack-api names were added to the dynamic import in Task 2.3; add the scan + permalink usage):

```js
import { scanOffers } from "./scan.mjs";
```

- [ ] **Step 2: Add the `menuScanOffers()` action** (place near the other `menu*` functions):

```js
/** Menu action: scan configured channels for offer-posts, then optionally award. */
async function menuScanOffers() {
  const course = await pickCourse();
  if (!course) return console.log("No course selected.");

  console.log("\nScanning Slack (this loads the local model on first run)…");
  let result;
  try {
    result = await scanOffers(course, { listChannels, getChannelHistory, getPermalink });
  } catch (error) {
    return console.error(`Scan failed: ${error.message}`);
  }

  if (result.noReferences) {
    console.log(
      "\nNo reference examples yet. Use \"Add post by URL\" to teach the scanner " +
        "your offer style (or add seedOfferPhrases to slack-checker/config.json), then scan again."
    );
    return;
  }

  console.log(
    `\nScanned ${result.channelsScanned.join(", ") || "(no channels)"}; ` +
      `embedded ${result.embeddedCount} messages.`
  );
  const { candidates } = result;
  if (candidates.length === 0) return console.log("No likely point-offer posts found.");

  console.log("\nLikely point-offer posts:\n");
  candidates.forEach((c, i) => {
    const flag = c.alreadyAwarded ? " [awarded ✓]" : c.inLedger ? " [in ledger]" : "";
    const when = new Date(parseFloat(c.ts) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const snippet = (c.text || "").replace(/\s+/g, " ").slice(0, 50);
    console.log(`  ${i + 1}) ${(c.score * 100).toFixed(0)}% ${when} (${c.channel})${flag}: "${snippet}"`);
  });

  const pick = await ask("\nAward which post(s)? (comma-separated numbers, or Enter to skip): ");
  if (!pick) return console.log("No posts selected.");
  const indices = pick.split(",").map((s) => parseInt(s.trim(), 10) - 1).filter((n) => candidates[n]);
  if (indices.length === 0) return console.log("No valid selection.");

  const points = parseInt(await ask("Points per responder [2]: ", "2"), 10);
  if (isNaN(points) || points < 1) return console.log("Invalid points — must be a positive integer.");
  const hours = parseFloat(await ask(`Time window in hours [${DEFAULT_HOURS}]: `, String(DEFAULT_HOURS)));
  if (isNaN(hours) || hours <= 0) return console.log("Invalid hours — must be a positive number.");

  for (const n of indices) {
    const c = candidates[n];
    let threadUrl;
    try {
      threadUrl = await getPermalink(c.channelId, c.ts);
    } catch (error) {
      console.error(`  Could not get permalink for #${c.channel} post: ${error.message}`);
      continue;
    }
    console.log(`\n--- Awarding for: ${c.channel} "${(c.text || "").slice(0, 40)}" ---`);
    await awardFromThread({ threadUrl, course, points, hours, dryRun: false, skipConfirm: false, topUp: c.alreadyAwarded });
  }
}
```

- [ ] **Step 3: Wire option 1 in `runMenu()`** — replace the stub. Change:
```js
  console.log("  1) Scan for new point-offer posts        (coming soon)");
```
to:
```js
  console.log("  1) Scan for new point-offer posts");
```
and in the `switch`, replace the `case "1":` (which currently falls through to the "coming soon" message) so that `case "1": return menuScanOffers();` and leave `case "5":` returning the "later update" message on its own:
```js
    case "1": return menuScanOffers();
    case "2": return menuAwardFromUrl();
    case "3": return menuAddByUrl();
    case "4": return menuListPosts();
    case "5":
      return console.log("That option arrives in a later update.");
    default:
      return console.log("Unknown option.");
```

- [ ] **Step 4: Verify parse, import safety, and full suite**

Run:
```bash
node -c slack-checker/check-responses.mjs && echo "parse OK"
node --input-type=module -e 'import * as m from "./slack-checker/check-responses.mjs"; console.log(typeof m.awardFromThread)'
yarn test
```
Expected: `parse OK`; `function`; all tests pass (existing 86 + new embeddings(6) + scan(4) = 96).

- [ ] **Step 5: Commit**

```bash
git add slack-checker/check-responses.mjs
git commit -m "feat(slack): wire semantic scan into menu option 1"
```

---

## Manual end-to-end verification (after all tasks; needs a real terminal + Slack)

1. Ensure `slack-checker/config.json` has the course's `channels`, `semesterStart/End`, and (optionally) `instructorSlackId`. The bot must be a member of those channels.
2. Seed the scanner: `yarn check-slack` → option 3 (Add post by URL) on one real past offer-post (or rely on `seedOfferPhrases`).
3. `yarn check-slack` → option 1 (Scan). Confirm: it lists your offer-posts ranked by score, marks already-awarded ones, and a clearly-unrelated message does not appear. Pick one → it awards via the existing flow and the ledger updates (verify with option 4).
4. Confirm a non-offer message (e.g. an announcement) is NOT listed (tune `offerThreshold` in config if needed).

## Self-Review

**Spec coverage (Phase 2):** transformers.js embeddings classifier (2.1, 2.2 ✓), channel history + permalink via slack-api (2.3 ✓), config-driven channels/window + instructor filter + seed/ledger references (2.4 ✓), menu option 1 scan→list→award with already-awarded flags (2.5 ✓), cold-start via seedOfferPhrases (2.4 noReferences path ✓).

**Type/name consistency:** `embed/cosineSim/maxCosineToAny/classifyOffers/getEmbedder` (embeddings.mjs) used consistently. `scanOffers(course, slack)` injects `{listChannels,getChannelHistory,getPermalink}` — the same names exported by slack-api.mjs and added to check-responses' dynamic import (2.3). Candidate `ts` is the message timestamp and is used as the ledger `threadTs` key (matches Phase 1, where `threadTs = parsed.messageTs`); awarding goes through `getPermalink → awardFromThread`, which re-parses the permalink to the same `messageTs`. `offerThreshold`/`seedOfferPhrases`/`instructorSlackId` read from config match the Task 1.4 config shape.

**Placeholder scan:** No placeholders or TODOs; every step contains the actual code to write.
