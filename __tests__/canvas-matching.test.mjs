import {
  parseNameParts,
  scoreNameMatch,
  matchLotteryToCanvas,
} from "../export-lottery-to-canvas.mjs";

describe("parseNameParts", () => {
  test("parses first and last name", () => {
    const result = parseNameParts("Daniel Kim");
    expect(result.firstName).toBe("daniel");
    expect(result.lastName).toBe("kim");
    expect(result.parts).toEqual(["daniel", "kim"]);
  });

  test("parses name with middle initial", () => {
    const result = parseNameParts("Daniel W. Kim");
    expect(result.firstName).toBe("daniel");
    expect(result.lastName).toBe("kim");
    expect(result.parts).toEqual(["daniel", "w", "kim"]);
  });

  test("handles single-part name", () => {
    const result = parseNameParts("Daniel");
    expect(result.firstName).toBe("daniel");
    expect(result.lastName).toBe("daniel");
    expect(result.parts).toEqual(["daniel"]);
  });
});

describe("scoreNameMatch", () => {
  test("exact normalized match returns 100", () => {
    const a = parseNameParts("Daniel Kim");
    const b = parseNameParts("daniel kim");
    expect(scoreNameMatch(a, b)).toBe(100);
  });

  test("all parts of shorter name in longer name returns 95", () => {
    const a = parseNameParts("Daniel W. Kim");
    const b = parseNameParts("Daniel Kim");
    // "daniel" and "kim" are both in ["daniel", "w", "kim"]
    expect(scoreNameMatch(a, b)).toBe(95);
  });

  test("first and last name exact match returns 90 when middle parts differ", () => {
    // Both have 3 parts with matching first+last but different middles.
    // allPartsMatch fails ("q" not in ["daniel","z","kim"]) but firstName+lastName match.
    const a = parseNameParts("Daniel Q Kim");
    const b = parseNameParts("Daniel Z Kim");
    expect(scoreNameMatch(a, b)).toBe(90);
  });

  test("same first name but different last name scores below 70 (MIN_CONFIDENCE)", () => {
    // This is the bug case: "Daniel Luo" should NOT match "Daniel Kim"
    const a = parseNameParts("Daniel Luo");
    const b = parseNameParts("Daniel Kim");
    const score = scoreNameMatch(a, b);
    expect(score).toBeLessThan(70);
  });

  test("completely different names score very low", () => {
    const a = parseNameParts("Alexander Blakeney");
    const b = parseNameParts("Zain Rizvi");
    const score = scoreNameMatch(a, b);
    expect(score).toBeLessThan(50);
  });

  test("similar last names with different first names still score reasonably", () => {
    const a = parseNameParts("Jon Smith");
    const b = parseNameParts("John Smith");
    const score = scoreNameMatch(a, b);
    expect(score).toBeGreaterThanOrEqual(70);
  });
});

describe("matchLotteryToCanvas", () => {
  // Helper to create lottery count entries
  const lotteryEntry = (name, count, sum) => ({ _id: name, count, sum });
  // Helper to create Canvas enrollment entries
  const canvasStudent = (name, userId) => ({
    name,
    userId,
    sortableName: name.split(" ").reverse().join(", "),
  });

  test("matches lottery entries to Canvas students by name", () => {
    const lottery = [lotteryEntry("Daniel W. Kim", 18, 21)];
    const canvas = [canvasStudent("Daniel Kim", 101)];

    const result = matchLotteryToCanvas(lottery, canvas);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].lotteryName).toBe("Daniel W. Kim");
    expect(result.matched[0].canvasUserId).toBe(101);
  });

  test("two lottery entries claiming same Canvas student: highest confidence wins", () => {
    const lottery = [
      lotteryEntry("Daniel W. Kim", 18, 21), // should win (higher confidence)
      lotteryEntry("Daniel Luo", 11, 4),      // should lose or not match
    ];
    const canvas = [canvasStudent("Daniel Kim", 101)];

    const result = matchLotteryToCanvas(lottery, canvas);

    // Only one match for Canvas student 101
    const matchesForKim = result.matched.filter((m) => m.canvasUserId === 101);
    expect(matchesForKim).toHaveLength(1);
    expect(matchesForKim[0].lotteryName).toBe("Daniel W. Kim");
  });

  test("displaced entries appear in unmatchedLottery", () => {
    // Force a conflict by using names that both match above threshold
    // "James Smith" and "Jamie Smith" both match "James Smith" in Canvas
    const lottery = [
      lotteryEntry("James Smith", 10, 20),   // exact match → 100
      lotteryEntry("Jamie Smith", 5, 8),      // partial match
    ];
    const canvas = [canvasStudent("James Smith", 201)];

    const result = matchLotteryToCanvas(lottery, canvas);

    // James Smith should win
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].lotteryName).toBe("James Smith");

    // Jamie Smith should be unmatched (displaced or below threshold)
    const jamie = result.unmatchedLottery.find((u) => u.name === "Jamie Smith");
    expect(jamie).toBeDefined();
  });

  test("displaced entries have displaced flag set to true", () => {
    // Use names where both clearly match the same Canvas student above threshold
    // "Alexander Blakeney" and "Alex Blakeney" both match "Alexander Blakeney"
    const lottery = [
      lotteryEntry("Alexander Blakeney", 15, 30),  // exact → 100
      lotteryEntry("Alex Blakeney", 5, 10),         // partial but last name matches
    ];
    const canvas = [canvasStudent("Alexander Blakeney", 301)];

    const result = matchLotteryToCanvas(lottery, canvas);

    // Winner is the exact match
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].lotteryName).toBe("Alexander Blakeney");

    // The loser should be displaced
    const displaced = result.unmatchedLottery.find((u) => u.name === "Alex Blakeney");
    expect(displaced).toBeDefined();
    expect(displaced.displaced).toBe(true);
  });

  test("Canvas students with no lottery match appear in noLotteryEntries", () => {
    const lottery = [lotteryEntry("Daniel W. Kim", 18, 21)];
    const canvas = [
      canvasStudent("Daniel Kim", 101),
      canvasStudent("Jane Doe", 102), // no lottery entry for this student
    ];

    const result = matchLotteryToCanvas(lottery, canvas);

    expect(result.noLotteryEntries).toHaveLength(1);
    expect(result.noLotteryEntries[0].canvasName).toBe("Jane Doe");
    expect(result.noLotteryEntries[0].canvasUserId).toBe(102);
    expect(result.noLotteryEntries[0].points).toBe(0);
  });

  test("lottery entries below threshold appear in unmatchedLottery", () => {
    const lottery = [lotteryEntry("Completely Different", 3, 5)];
    const canvas = [canvasStudent("Daniel Kim", 101)];

    const result = matchLotteryToCanvas(lottery, canvas);

    expect(result.matched).toHaveLength(0);
    expect(result.unmatchedLottery).toHaveLength(1);
    expect(result.unmatchedLottery[0].name).toBe("Completely Different");
    expect(result.unmatchedLottery[0].displaced).toBe(false);
  });
});
