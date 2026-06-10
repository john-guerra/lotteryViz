// Pure formatting helpers for the Slack-post ledger (no I/O — unit testable).

const SLACK_THREAD_PREFIX = "Responded to Slack thread: ";

/** Extract the thread URL from a grade doc's reason string, or null. */
export function extractThreadUrl(reason) {
  if (typeof reason !== "string" || !reason.startsWith(SLACK_THREAD_PREFIX)) return null;
  const url = reason.slice(SLACK_THREAD_PREFIX.length).trim();
  return url || null;
}

/** Collapse whitespace and truncate post text to a short display snippet. */
export function truncateSnippet(text, max = 50) {
  if (!text) return "";
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : oneLine.slice(0, max - 1) + "…";
}
