import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import CanvasExportModal from "./CanvasExportModal";
import { runExportJob } from "../canvasExportJob.mjs";

vi.mock("../canvasExportJob.mjs", () => ({ runExportJob: vi.fn() }));

// Hands the modal a job whose progress and completion the test drives.
function controllableJob() {
  const job = {};
  runExportJob.mockImplementation((opts) => {
    job.opts = opts;
    job.promise = new Promise((resolve, reject) => {
      job.resolve = resolve;
      job.reject = reject;
    });
    return { promise: job.promise, cancel: () => {} };
  });
  return job;
}

const student = (name, userId) => ({
  lotteryName: name,
  canvasName: name,
  canvasUserId: userId,
  grade: 100,
  points: 5,
  calls: 3,
});

const courseResult = (courseName, overrides = {}) => ({
  success: true,
  courseName,
  stats: { median: 5, medianCalls: 3 },
  studentsWithGrades: [student(`${courseName} student`, courseName.length)],
  unmatchedLottery: [],
  ...overrides,
});

async function finish(job, result) {
  await act(async () => {
    job.resolve(result);
    await job.promise;
  });
}

afterEach(() => vi.clearAllMocks());

describe("CanvasExportModal", () => {
  test("hides likely-dropped students by default and shows them when unchecked", async () => {
    const job = controllableJob();
    render(<CanvasExportModal open course="webdev" onClose={() => {}} />);
    await finish(
      job,
      courseResult("webdev", {
        unmatchedLottery: [
          { name: "Dropped, Dora", calls: 1, points: 1, likelyDropped: true },
          { name: "Typo, Tomas", calls: 2, points: 2, likelyDropped: false },
        ],
      })
    );

    expect(screen.getByText(/Typo, Tomas/)).toBeInTheDocument();
    expect(screen.queryByText(/Dropped, Dora/)).not.toBeInTheDocument();

    const toggle = screen.getByLabelText(/Hide 1 likely-dropped student/);
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(screen.getByText(/Dropped, Dora/)).toBeInTheDocument();
  });

  test("keeps an unmatched count visible when every entry is likely dropped", async () => {
    const job = controllableJob();
    render(<CanvasExportModal open course="webdev" onClose={() => {}} />);
    await finish(
      job,
      courseResult("webdev", {
        unmatchedLottery: [{ name: "Dropped, Dora", calls: 1, points: 1, likelyDropped: true }],
      })
    );
    expect(screen.getByText(/1 unmatched/)).toBeInTheDocument();
    expect(screen.queryByText(/Dropped, Dora/)).not.toBeInTheDocument();
  });

  test("streams job log lines while the export is running", async () => {
    const job = controllableJob();
    render(<CanvasExportModal open course="webdev" onClose={() => {}} />);
    act(() => job.opts.onProgress(["Fetching Canvas enrollments...", "  Found 3"]));
    expect(screen.getByText(/Fetching Canvas enrollments/)).toBeInTheDocument();
  });

  test("all-courses mode renders one section per course and submits them together", async () => {
    const job = controllableJob();
    render(<CanvasExportModal open all onClose={() => {}} />);
    expect(job.opts).toMatchObject({ all: true, dryRun: true });

    await finish(job, {
      success: true,
      results: [
        courseResult("webdev"),
        courseResult("aicoding"),
        { success: false, courseName: "broken", error: "Canvas said no" },
      ],
    });

    expect(screen.getByRole("heading", { name: /webdev/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /aicoding/ })).toBeInTheDocument();
    expect(screen.getByText(/Canvas said no/)).toBeInTheDocument();

    const submit = screen.getByRole("button", { name: /Submit 2 grades across 2 courses/ });
    const liveJob = controllableJob();
    fireEvent.click(submit);
    // Only the courses the instructor actually saw previewed are submitted;
    // the failed "broken" preview must not be written blind.
    expect(liveJob.opts).toMatchObject({
      all: true,
      dryRun: false,
      courses: ["webdev", "aicoding"],
    });
  });
});
