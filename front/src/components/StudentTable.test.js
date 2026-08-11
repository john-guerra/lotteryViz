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

  // The warning is gated on gradesStatus === "ready"; unmatchedNames alone
  // must not be enough to trigger it while grades are still loading or idle.
  test("does not show a warning while loading even if the name is unmatched", () => {
    renderTable({
      gradesStatus: "loading",
      unmatchedNames: new Set(["GRACE HOPPER"]),
    });
    expect(gradeCellFor("GRACE HOPPER")).toBe("·");
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
