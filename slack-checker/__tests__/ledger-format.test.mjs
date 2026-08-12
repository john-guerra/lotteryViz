import {
  extractThreadUrl,
  truncateSnippet,
} from "../ledger-format.mjs";

import {
  computeParticipation,
  enrichPointHistory,
} from "../ledger-format.mjs";

const url1 = "https://t.slack.com/archives/C1/p1";
const url2 = "https://t.slack.com/archives/C1/p2";

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
  test("returns null for a prefix with no URL", () => {
    expect(extractThreadUrl("Responded to Slack thread: ")).toBeNull();
  });
  test("returns null for non-string input", () => {
    expect(extractThreadUrl(42)).toBeNull();
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
  test("handles null input", () => {
    expect(truncateSnippet(null)).toBe("");
  });
});

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
