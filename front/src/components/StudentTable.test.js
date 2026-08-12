import React from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";
import StudentTable from "./StudentTable";
import { SelectionProvider } from "../context/SelectionContext";

const COUNTS = [
  { _id: "ADA LOVELACE", count: 12, sum: 18 },
  { _id: "ALAN TURING", count: 7, sum: 9 },
  { _id: "GRACE HOPPER", count: 2, sum: 1 },
];

function renderTable(props = {}) {
  return render(
    <SelectionProvider>
      <StudentTable
        counts={COUNTS}
        allGrades={[]}
        onShowHistory={() => {}}
        {...props}
      />
    </SelectionProvider>
  );
}

// Returns the Grade cell text for a given student row.
function gradeCellFor(name) {
  const row = screen.getByText(name).closest("tr");
  return within(row).getAllByRole("cell")[4].textContent;
}

// Returns the Grade cell element for a given student row, so its inline
// backgroundColor can be inspected.
function gradeCellElementFor(name) {
  const row = screen.getByText(name).closest("tr");
  return within(row).getAllByRole("cell")[4];
}

// Pulls the r/g/b channels out of an rgba(...) string. A plain /\d+/g match
// would split the trailing alpha (e.g. "0.3") into extra numbers, so this
// anchors on the first three comma-separated components explicitly.
function rgbChannels(el) {
  const match = el.style.backgroundColor.match(
    /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/
  );
  if (!match) throw new Error(`Not an rgb(a) color: ${el.style.backgroundColor}`);
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

describe("StudentTable Grade column", () => {
  test("renders a Grade header", () => {
    renderTable();
    expect(screen.getByText(/^Grade/)).toBeInTheDocument();
  });

  test("shows a dash for every row when idle", () => {
    renderTable({ gradesStatus: "idle" });
    expect(gradeCellFor("ADA LOVELACE")).toBe("–");
    expect(gradeCellFor("ALAN TURING")).toBe("–");
    expect(gradeCellFor("GRACE HOPPER")).toBe("–");
  });

  test("shows a dot for every row while loading", () => {
    renderTable({ gradesStatus: "loading" });
    expect(gradeCellFor("ADA LOVELACE")).toBe("·");
    expect(gradeCellFor("ALAN TURING")).toBe("·");
    expect(gradeCellFor("GRACE HOPPER")).toBe("·");
  });

  test("shows the grade when one is loaded", () => {
    renderTable({
      gradesStatus: "ready",
      canvasGrades: { "ADA LOVELACE": 107.3, "ALAN TURING": 98.1 },
    });
    expect(gradeCellFor("ADA LOVELACE")).toBe("107.3");
    expect(gradeCellFor("ALAN TURING")).toBe("98.1");
  });

  test("shows a warning for a student with no Canvas match", () => {
    renderTable({
      gradesStatus: "ready",
      canvasGrades: { "ADA LOVELACE": 107.3 },
      unmatchedNames: new Set(["GRACE HOPPER"]),
    });
    expect(gradeCellFor("GRACE HOPPER")).toBe("⚠");
  });

  test("shows a dash for a student who is neither graded nor unmatched", () => {
    renderTable({
      gradesStatus: "ready",
      canvasGrades: { "ADA LOVELACE": 107.3 },
      unmatchedNames: new Set(),
    });
    expect(gradeCellFor("ALAN TURING")).toBe("–");
  });

  test("does not show a warning when idle even if the name is unmatched", () => {
    renderTable({
      gradesStatus: "idle",
      unmatchedNames: new Set(["GRACE HOPPER"]),
    });
    expect(gradeCellFor("GRACE HOPPER")).toBe("–");
  });
});

describe("StudentTable Grade sorting", () => {
  const graded = {
    gradesStatus: "ready",
    canvasGrades: { "ADA LOVELACE": 107.3, "ALAN TURING": 98.1 },
    unmatchedNames: new Set(["GRACE HOPPER"]),
  };

  // Row order by name. Cell 0 is Name (anonymize defaults to false).
  function gradeColumnOrder() {
    const rows = screen.getAllByRole("row").slice(1); // drop the header row
    return rows.map((r) => within(r).getAllByRole("cell")[0].textContent);
  }

  // Header order: Name, #Calls, Points, Pts/Call, Grade, Last 10, (actions).
  function gradeHeader() {
    return screen.getByText(/^Grade/);
  }

  test("ungraded rows sort last ascending", () => {
    renderTable(graded);
    fireEvent.click(gradeHeader());
    expect(gradeColumnOrder()).toEqual(["ALAN TURING", "ADA LOVELACE", "GRACE HOPPER"]);
  });

  test("ungraded rows sort last descending too", () => {
    renderTable(graded);
    fireEvent.click(gradeHeader()); // asc
    fireEvent.click(gradeHeader()); // desc
    expect(gradeColumnOrder()).toEqual(["ADA LOVELACE", "ALAN TURING", "GRACE HOPPER"]);
  });

  test("tied grades break by points descending", () => {
    renderTable({
      gradesStatus: "ready",
      canvasGrades: {
        "ADA LOVELACE": 100,
        "ALAN TURING": 100,
        "GRACE HOPPER": 100,
      },
      unmatchedNames: new Set(),
    });
    fireEvent.click(gradeHeader());
    // All tied at 100, so points (18, 9, 1) descending decides.
    expect(gradeColumnOrder()).toEqual(["ADA LOVELACE", "ALAN TURING", "GRACE HOPPER"]);
  });

  // COUNTS happens to already be in points-descending order, so a comparator
  // that returns 0 on a grade tie (i.e. the points tiebreak deleted) would
  // still pass the test above via Array.prototype.sort's stability. This
  // fixture is inserted in ASCENDING points order — the opposite of the
  // expected output — so the assertion can only pass if the tiebreaker
  // genuinely runs.
  test("tied grades break by points descending even when insertion order differs", () => {
    const ASCENDING_POINTS_COUNTS = [
      { _id: "IVY INGRAM", count: 3, sum: 1 },
      { _id: "BEN BAKER", count: 5, sum: 9 },
      { _id: "COY CARSON", count: 8, sum: 18 },
    ];
    renderTable({
      counts: ASCENDING_POINTS_COUNTS,
      gradesStatus: "ready",
      canvasGrades: {
        "IVY INGRAM": 100,
        "BEN BAKER": 100,
        "COY CARSON": 100,
      },
      unmatchedNames: new Set(),
    });
    fireEvent.click(gradeHeader());
    expect(gradeColumnOrder()).toEqual(["COY CARSON", "BEN BAKER", "IVY INGRAM"]);
  });

  // When grade AND points both tie, the fallback is alphabetical by name.
  // Fixture is inserted out of alphabetical order so a comparator that
  // returns 0 there (instead of calling localeCompare) would leave insertion
  // order intact and fail this assertion.
  test("ties on both grade and points break alphabetically by name", () => {
    const SAME_POINTS_COUNTS = [
      { _id: "ZOE ZEPHYR", count: 5, sum: 10 },
      { _id: "AMY ADLER", count: 5, sum: 10 },
      { _id: "MEG MORSE", count: 5, sum: 10 },
    ];
    renderTable({
      counts: SAME_POINTS_COUNTS,
      gradesStatus: "ready",
      canvasGrades: {
        "ZOE ZEPHYR": 100,
        "AMY ADLER": 100,
        "MEG MORSE": 100,
      },
      unmatchedNames: new Set(),
    });
    fireEvent.click(gradeHeader());
    expect(gradeColumnOrder()).toEqual(["AMY ADLER", "MEG MORSE", "ZOE ZEPHYR"]);
  });
});

describe("StudentTable Grade color domain", () => {
  // GRADE_EXTENT is fixed at [60, 110] specifically so a one-SD-below-median
  // grade (78) reads as a real red penalty instead of near-white, and an
  // above-median grade (107) reads as a clear blue. A data-derived extent
  // would wash both of these out — e.g. with a broken extent of [-100, 110],
  // 78 normalizes to ~0.445 (barely off-center) instead of ~0.225, which
  // still yields r > b, just by a tiny margin (rgb 249,230,219 rather than
  // 221,113,92). A bare "greater than" comparison would not catch that, so
  // this asserts a real gap between the channels, not just their order —
  // The rendered values are rgba strings; asserting a gap rather than an
  // exact string means a harmless tint tweak (e.g. the 0.3 alpha) doesn't
  // break this, but a domain change does.
  const MIN_CHANNEL_GAP = 60;

  test("getCellColor with the fixed domain returns a visibly red tint at 78 and a blue one at 107", () => {
    renderTable({
      gradesStatus: "ready",
      canvasGrades: { "ADA LOVELACE": 78, "ALAN TURING": 107 },
    });

    const red = rgbChannels(gradeCellElementFor("ADA LOVELACE"));
    expect(red.r - red.b).toBeGreaterThan(MIN_CHANNEL_GAP);

    const blue = rgbChannels(gradeCellElementFor("ALAN TURING"));
    expect(blue.b - blue.r).toBeGreaterThan(MIN_CHANNEL_GAP);
  });
});
