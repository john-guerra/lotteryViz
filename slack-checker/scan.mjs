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
 * @returns {Promise<{candidates:Array, embeddedCount:number, channelsScanned:string[], noReferences?:boolean}>}
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
