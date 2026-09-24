import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import PropTypes from "prop-types";
import { runExportJob } from "../canvasExportJob.mjs";

// Preview-before-write modal for Canvas grade export. Opens on a dry run,
// renders the computed grades, and only writes when the instructor confirms.
// The confirm re-runs the export live rather than replaying the preview, so a
// stale preview can never submit old grades.
//
// With `all`, one job exports every Canvas-wired course in turn and the
// preview renders one section per course.

// The dry run is a read-only preview; 2 minutes is generous for that. The
// live commit is a sequential per-student loop of Canvas PUTs plus paginated
// enrollment fetches and a verification pass — at ~1.5s/student a 60-student
// class alone exceeds 2 minutes. Give it 15 minutes so the client doesn't
// give up on a submission that is still succeeding server-side. Both scale
// with the number of courses in an all-courses run, since those run serially.
const DRY_RUN_DEADLINE_MS = 120000;
const LIVE_DEADLINE_MS = 900000;

// The same lines the CLI prints, streamed from the job while it runs.
function ExportLog({ lines, live }) {
  const ref = useRef(null);

  useEffect(() => {
    if (live && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines, live]);

  if (lines.length === 0) return null;

  const pre = (
    <pre
      ref={ref}
      className="bg-dark text-light p-2 mb-0 small"
      style={{ maxHeight: "40vh", overflow: "auto", whiteSpace: "pre-wrap" }}
    >
      {lines.join("\n")}
    </pre>
  );

  if (live) return pre;
  return (
    <details className="mt-3">
      <summary>Export log ({lines.length} lines)</summary>
      {pre}
    </details>
  );
}

ExportLog.propTypes = {
  lines: PropTypes.arrayOf(PropTypes.string).isRequired,
  live: PropTypes.bool.isRequired,
};

// Unmatched leads: name matching runs at 70% confidence, and an unmatched
// student is about to silently receive no grade. Entries that are off the
// roster too are almost always students who dropped, so they hide by default
// but stay counted so none of them vanish unnoticed.
function UnmatchedList({ unmatched }) {
  const [hideDropped, setHideDropped] = useState(true);
  const toggleId = useId();
  const droppedCount = unmatched.filter((u) => u.likelyDropped).length;
  const visible = hideDropped ? unmatched.filter((u) => !u.likelyDropped) : unmatched;

  if (unmatched.length === 0) return null;

  const toggle = droppedCount > 0 && (
    <div className="form-check mt-1">
      <input
        type="checkbox"
        className="form-check-input"
        id={toggleId}
        checked={hideDropped}
        onChange={(e) => setHideDropped(e.target.checked)}
      />
      <label className="form-check-label" htmlFor={toggleId}>
        Hide {droppedCount} likely-dropped student{droppedCount === 1 ? "" : "s"} (not on
        the roster and not in Canvas)
      </label>
    </div>
  );

  if (visible.length === 0) {
    return <div className="text-muted small mb-2">{toggle}</div>;
  }

  return (
    <div className="alert alert-warning">
      <strong>{unmatched.length} unmatched</strong> — these students have lottery points
      but no Canvas match, and will not be graded:
      <ul className="mb-0 mt-1">
        {visible.map((u) => (
          <li key={u.name}>
            {u.name} ({u.calls} call{u.calls === 1 ? "" : "s"}, {u.points} pts)
            {u.likelyDropped && <span className="badge badge-secondary ml-1">likely dropped</span>}
            {u.bestMatch && (
              <span className="text-muted">
                {" "}
                — closest: {u.bestMatch} ({u.bestScore}%)
              </span>
            )}
          </li>
        ))}
      </ul>
      {toggle}
    </div>
  );
}

UnmatchedList.propTypes = {
  unmatched: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      calls: PropTypes.number,
      points: PropTypes.number,
      bestMatch: PropTypes.string,
      bestScore: PropTypes.number,
      likelyDropped: PropTypes.bool,
    })
  ).isRequired,
};

function CoursePreview({ result, hasAssignment }) {
  if (result.success === false) {
    return <div className="alert alert-danger">{result.error || "Export failed."}</div>;
  }

  const students = result.studentsWithGrades || [];

  return (
    <>
      <p className="mb-2">
        <strong>{students.length}</strong> grades ready. Median {result.stats?.median} pts,{" "}
        {result.stats?.medianCalls} calls.
      </p>

      <UnmatchedList unmatched={result.unmatchedLottery || []} />

      {!hasAssignment && (
        <div className="alert alert-info">
          No lottery assignment is configured for this course. Submitting will find or
          create one in Canvas.
        </div>
      )}

      <table className="table table-sm">
        <thead>
          <tr>
            <th>Lottery name</th>
            <th>Canvas name</th>
            <th className="text-right">Grade</th>
            <th className="text-right">Pts</th>
            <th className="text-right">Calls</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.canvasUserId}>
              <td>{s.lotteryName}</td>
              <td>{s.canvasName}</td>
              <td className="text-right">{s.grade}</td>
              <td className="text-right">{s.points}</td>
              <td className="text-right">{s.calls}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

CoursePreview.propTypes = {
  result: PropTypes.object.isRequired,
  hasAssignment: PropTypes.bool.isRequired,
};

function CourseDone({ result }) {
  if (result.success === false) {
    return <div className="alert alert-danger mb-2">{result.error || "Export failed."}</div>;
  }
  return (
    <div className={`alert ${result.errors ? "alert-warning" : "alert-success"} mb-2`}>
      Submitted {result.submitted}, {result.errors} error
      {result.errors === 1 ? "" : "s"}
      {result.verification
        ? `, verified ${result.verification.verified}/${result.verification.total}`
        : ""}
      .
    </div>
  );
}

CourseDone.propTypes = {
  result: PropTypes.object.isRequired,
};

export default function CanvasExportModal({
  open,
  course,
  all = false,
  assignmentIds = {},
  onClose,
}) {
  const [phase, setPhase] = useState("running"); // running|preview|committing|done|error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const jobRef = useRef(null);

  // Scale deadlines by how many courses run back to back.
  const courseCount = all ? Math.max(1, Object.keys(assignmentIds).length) : 1;

  const stopPolling = useCallback(() => {
    if (jobRef.current) {
      jobRef.current.cancel();
      jobRef.current = null;
    }
  }, []);

  const run = useCallback(
    (dryRun) => {
      setPhase(dryRun ? "running" : "committing");
      setError(null);
      setLogLines([]);

      const job = runExportJob({
        course,
        all,
        dryRun,
        onProgress: setLogLines,
        deadlineMs: (dryRun ? DRY_RUN_DEADLINE_MS : LIVE_DEADLINE_MS) * courseCount,
      });
      jobRef.current = job;

      job.promise.then(
        (jobResult) => {
          jobRef.current = null;
          setResult(jobResult);
          setPhase(dryRun ? "preview" : "done");
        },
        (err) => {
          jobRef.current = null;
          setError(err.message);
          setPhase("error");
        }
      );
    },
    [course, all, courseCount]
  );

  useEffect(() => {
    if (!open) return undefined;
    setResult(null);
    run(true);
    return stopPolling;
  }, [open, run, stopPolling]);

  if (!open) return null;

  const busy = phase === "running" || phase === "committing";
  // A single-course result and an all-courses result render the same way.
  const courseResults = !result ? [] : all ? result.results || [] : [{ courseName: course, ...result }];
  const gradedCourses = courseResults.filter(
    (r) => r.success !== false && (r.studentsWithGrades || []).length > 0
  );
  const totalStudents = gradedCourses.reduce(
    (sum, r) => sum + r.studentsWithGrades.length,
    0
  );
  const title = all ? "Export all courses to Canvas" : `Export to Canvas — ${course}`;
  const submitLabel = all
    ? `Submit ${totalStudents} grades across ${gradedCourses.length} course${
      gradedCourses.length === 1 ? "" : "s"
    }`
    : `Submit ${totalStudents} grades to Canvas`;

  const renderPerCourse = (Body, extraProps) =>
    courseResults.map((r) =>
      all ? (
        <section key={r.courseName} className="mb-4">
          <h5 className="border-bottom pb-1">{r.courseName}</h5>
          <Body result={r} {...extraProps(r)} />
        </section>
      ) : (
        <Body key={r.courseName} result={r} {...extraProps(r)} />
      )
    );

  return (
    <div
      className="modal show d-block"
      tabIndex="-1"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={busy ? undefined : onClose}
    >
      <div
        className="modal-dialog modal-lg modal-dialog-scrollable"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            {!busy && (
              <button type="button" className="close" onClick={onClose}>
                <span>&times;</span>
              </button>
            )}
          </div>

          <div className="modal-body">
            {phase === "running" && <p>Computing grades…</p>}
            {phase === "committing" && <p>Submitting to Canvas…</p>}
            {busy && <ExportLog lines={logLines} live />}

            {phase === "error" && <div className="alert alert-danger mb-0">{error}</div>}

            {phase === "done" && renderPerCourse(CourseDone, () => ({}))}

            {phase === "preview" &&
              renderPerCourse(CoursePreview, (r) => ({
                hasAssignment: Boolean(
                  all ? assignmentIds[r.courseName] : assignmentIds[course]
                ),
              }))}

            {!busy && <ExportLog lines={logLines} live={false} />}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={busy}
            >
              {phase === "done" || phase === "error" ? "Close" : "Cancel"}
            </button>
            {phase === "preview" && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => run(false)}
                disabled={totalStudents === 0}
              >
                {submitLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

CanvasExportModal.propTypes = {
  open: PropTypes.bool.isRequired,
  // Required unless `all` is set.
  course: PropTypes.string,
  all: PropTypes.bool,
  // Course key -> configured lottery assignment id (null when the live run
  // must find or create it). In `all` mode its keys are the courses exported.
  assignmentIds: PropTypes.objectOf(PropTypes.number),
  onClose: PropTypes.func.isRequired,
};
