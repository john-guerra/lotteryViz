import { toUnixSeconds, buildReferenceTexts } from "../scan.mjs";

describe("toUnixSeconds()", () => {
  test("converts a YYYY-MM-DD date to a unix-seconds string", () => {
    // 2026-05-04T00:00:00Z = 1777852800
    expect(toUnixSeconds("2026-05-04")).toBe("1777852800");
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

describe("scanOffers() channelsScanned", () => {
  // scanOffers reads config.json via loadScanConfig, so these run against a
  // temp config injected through the module's own loader is not possible --
  // instead they exercise the channel loop through a course that exists in
  // config.json. Kept to the reporting contract, which needs no network.
  const fakeSlack = ({ channels, history }) => ({
    listChannels: async () => new Map(channels.map((c) => [c, "C" + c])),
    getChannelHistory: async (id) => {
      const result = history[id];
      if (result instanceof Error) throw result;
      return result || [];
    },
    getPermalink: async () => "https://example.slack.com/archives/C1/p1",
  });

  test("a channel whose history fetch fails is NOT reported as scanned", async () => {
    // Previously channelsScanned.push() ran before the fetch, so a skipped
    // channel was still reported as scanned -- directly contradicting the
    // "Skipping #x" line printed right next to it.
    const { scanOffers } = await import("../scan.mjs");
    const { loadScanConfig } = await import("../config.js");
    const course = "webdev_summer_2026";
    const cfg = loadScanConfig(course);
    if (!cfg) return; // config.json is gitignored; skip when absent

    const err = Object.assign(new Error("not_in_channel"), {
      data: { error: "not_in_channel" },
    });
    const first = cfg.channels[0];
    const slack = fakeSlack({
      channels: cfg.channels,
      history: { ["C" + first]: err },
    });
    const result = await scanOffers(course, slack);
    expect(result.channelsScanned).not.toContain(first);
  });

  test("a channel missing from the workspace is NOT reported as scanned", async () => {
    const { scanOffers } = await import("../scan.mjs");
    const { loadScanConfig } = await import("../config.js");
    const course = "webdev_summer_2026";
    const cfg = loadScanConfig(course);
    if (!cfg) return;

    // Workspace exposes none of the configured channels.
    const slack = fakeSlack({ channels: [], history: {} });
    const result = await scanOffers(course, slack);
    expect(result.channelsScanned).toEqual([]);
  });
});
