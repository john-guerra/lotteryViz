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
