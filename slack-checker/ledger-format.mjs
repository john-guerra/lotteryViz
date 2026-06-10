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

/**
 * Participation counts for one student.
 * @param {Array<{reason:string}>} entries - the student's grade docs
 * @param {Array<{url:string}>} awardedPosts - awarded ledger docs for the course
 * @returns {{responded:number,total:number}}
 */
export function computeParticipation(entries, awardedPosts) {
  const awardedUrls = new Set(awardedPosts.map((p) => p.url));
  const respondedUrls = new Set();
  for (const e of entries || []) {
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
