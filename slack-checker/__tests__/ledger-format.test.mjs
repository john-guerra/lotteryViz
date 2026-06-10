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
