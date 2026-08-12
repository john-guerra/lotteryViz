import {
  computeCutoffTs,
  filterRepliesWithinWindow,
  uniqueResponderIds,
  previewThread,
  commitAward,
  addPostByUrl,
} from "../award-service.mjs";

// --- Pure helpers ---------------------------------------------------------

describe("computeCutoffTs()", () => {
  test("adds hours (in seconds) to the parent timestamp", () => {
    expect(computeCutoffTs(1000, 1)).toBe(1000 + 3600);
    expect(computeCutoffTs(1000, 24)).toBe(1000 + 24 * 3600);
    expect(computeCutoffTs(1000, 0.5)).toBe(1000 + 1800);
  });
});

describe("filterRepliesWithinWindow()", () => {
  test("keeps replies at or before the cutoff, drops later ones", () => {
    const replies = [
      { user: "U1", ts: "1500.0" },
      { user: "U2", ts: "4600.0" }, // exactly at cutoff → kept
      { user: "U3", ts: "5000.0" }, // after cutoff → dropped
    ];
    const kept = filterRepliesWithinWindow(replies, 4600);
    expect(kept.map((r) => r.user)).toEqual(["U1", "U2"]);
  });
});

describe("uniqueResponderIds()", () => {
  test("dedupes user ids, preserving first-seen order", () => {
    const replies = [
      { user: "U1" },
      { user: "U2" },
      { user: "U1" },
    ];
    expect(uniqueResponderIds(replies)).toEqual(["U1", "U2"]);
  });
});

// --- Orchestrators (dependency-injected, no real I/O) --------------------

/** Build a deps bundle with call-tracking fakes; override any piece per test. */
function makeDeps(overrides = {}) {
  const calls = { awardPoints: [], recordPost: [], markAwarded: [], userIdsLookedUp: null };
  const deps = {
    parseSlackUrl: () => ({ channelId: "C123", messageTs: "1000.000000" }),
    loadStudentRoster: () => ["Smith, Alice", "Jones, Bob"],
    getParentMessage: async () => ({ ts: "1000.000000", text: "reply here for 2 points" }),
    getThreadReplies: async () => [
      { user: "U1", ts: "1500.0" }, // in window
      { user: "U2", ts: "2000.0" }, // in window
      { user: "U3", ts: "5000.0" }, // out of window (cutoff 4600 at hours=1)
    ],
    getUserDisplayNames: async (ids) => {
      calls.userIdsLookedUp = ids;
      const map = new Map();
      for (const id of ids) map.set(id, { U1: "Alice Smith", U2: "Bob Jones" }[id] || id);
      return map;
    },
    isAwarded: async () => false,
    recordPost: async (...args) => calls.recordPost.push(args),
    markAwarded: async (...args) => calls.markAwarded.push(args),
    awardPoints: async (...args) => {
      calls.awardPoints.push(args);
      return true;
    },
    ...overrides,
  };
  return { deps, calls };
}

describe("previewThread()", () => {
  test("only looks up responders inside the time window", async () => {
    const { deps, calls } = makeDeps();
    await previewThread({ course: "c", threadUrl: "url", hours: 1 }, deps);
    expect(calls.userIdsLookedUp).toEqual(["U1", "U2"]);
  });

  test("returns matched/unmatched and alreadyAwarded without writing", async () => {
    const { deps, calls } = makeDeps();
    const result = await previewThread({ course: "c", threadUrl: "url", hours: 1 }, deps);

    expect(result.matched.map((m) => m.rosterName).sort()).toEqual(["Jones, Bob", "Smith, Alice"]);
    expect(result.unmatched).toEqual([]);
    expect(result.alreadyAwarded).toBe(false);
    expect(result.threadTs).toBe("1000.000000");
    expect(result.parentText).toBe("reply here for 2 points");

    // No DB writes happen during a preview.
    expect(calls.awardPoints).toHaveLength(0);
    expect(calls.recordPost).toHaveLength(0);
    expect(calls.markAwarded).toHaveLength(0);
  });
});

describe("commitAward()", () => {
  test("awards one grade per matched student and records the ledger", async () => {
    const { deps, calls } = makeDeps();
    const result = await commitAward(
      { course: "c", threadUrl: "url", points: 2, hours: 1, topUp: false },
      deps
    );

    expect(result.awarded).toBe(2);
    expect(calls.awardPoints).toHaveLength(2);
    expect(calls.recordPost).toHaveLength(1);
    expect(calls.markAwarded).toHaveLength(1);
  });

  test("skips an already-awarded post unless topUp is set", async () => {
    const { deps, calls } = makeDeps({ isAwarded: async () => true });
    const result = await commitAward(
      { course: "c", threadUrl: "url", points: 2, hours: 1, topUp: false },
      deps
    );

    expect(result.awarded).toBe(0);
    expect(result.alreadyAwarded).toBe(true);
    expect(calls.awardPoints).toHaveLength(0);
    expect(calls.recordPost).toHaveLength(0);
  });

  test("topUp bypasses the dedup guard and still awards", async () => {
    const { deps, calls } = makeDeps({ isAwarded: async () => true });
    const result = await commitAward(
      { course: "c", threadUrl: "url", points: 2, hours: 1, topUp: true },
      deps
    );

    expect(result.awarded).toBe(2);
    expect(calls.awardPoints).toHaveLength(2);
  });
});

describe("addPostByUrl()", () => {
  test("records the parent as an un-awarded manual reference, without awarding", async () => {
    const { deps, calls } = makeDeps();
    const result = await addPostByUrl({ course: "c", threadUrl: "url" }, deps);

    expect(result.threadTs).toBe("1000.000000");
    expect(result.parentText).toBe("reply here for 2 points");

    expect(calls.recordPost).toHaveLength(1);
    const [, post] = calls.recordPost[0];
    expect(post.source).toBe("manual");
    expect(post.awarded).toBe(false);
    expect(post.text).toBe("reply here for 2 points");

    // Adding a reference must not award anyone.
    expect(calls.awardPoints).toHaveLength(0);
    expect(calls.markAwarded).toHaveLength(0);
  });
});
