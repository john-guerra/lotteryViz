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
  });

  test("shows a dot for every row while loading", () => {
    renderTable({ gradesStatus: "loading" });
    expect(gradeCellFor("ADA LOVELACE")).toBe("·");
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
});
