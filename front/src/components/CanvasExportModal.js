import React, { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { runExportJob } from "../canvasExportJob.mjs";

// Preview-before-write modal for Canvas grade export. Opens on a dry run,
// renders the computed grades, and only writes when the instructor confirms.
// The confirm re-runs the export live rather than replaying the preview, so a
// stale preview can never submit old grades.

// The dry run is a read-only preview; 2 minutes is generous for that. The
// live commit is a sequential per-student loop of Canvas PUTs plus paginated
// enrollment fetches and a verification pass — at ~1.5s/student a 60-student
// class alone exceeds 2 minutes. Give it 15 minutes so the client doesn't
// give up on a submission that is still succeeding server-side.
const DRY_RUN_DEADLINE_MS = 120000;
const LIVE_DEADLINE_MS = 900000;

export default function CanvasExportModal({
  open,
  course,
  assignmentId,
  onClose,
}) {
  const [phase, setPhase] = useState("running"); // running|preview|committing|done|error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const jobRef = useRef(null);

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

      const job = runExportJob({
        course,
        dryRun,
        deadlineMs: dryRun ? DRY_RUN_DEADLINE_MS : LIVE_DEADLINE_MS,
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
    [course]
  );

  useEffect(() => {
    if (!open) return undefined;
    setResult(null);
    run(true);
    return stopPolling;
  }, [open, run, stopPolling]);

  if (!open) return null;

  const busy = phase === "running" || phase === "committing";
  const students = result?.studentsWithGrades || [];
  const unmatched = result?.unmatchedLottery || [];

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
            <h5 className="modal-title">
              Export to Canvas — {course}
            </h5>
            {!busy && (
              <button type="button" className="close" onClick={onClose}>
                <span>&times;</span>
              </button>
            )}
          </div>

          <div className="modal-body">
            {phase === "running" && <p>Computing grades…</p>}
            {phase === "committing" && <p>Submitting to Canvas…</p>}
            {phase === "error" && <div className="alert alert-danger mb-0">{error}</div>}

            {phase === "done" && (
              <div className="alert alert-success mb-0">
                Submitted {result.submitted}, {result.errors} error
                {result.errors === 1 ? "" : "s"}
                {result.verification
                  ? `, verified ${result.verification.verified}/${result.verification.total}`
                  : ""}
                .
              </div>
            )}

            {phase === "preview" && (
              <>
                <p className="mb-2">
                  <strong>{students.length}</strong> grades ready. Median{" "}
                  {result.stats?.median} pts, {result.stats?.medianCalls} calls.
                </p>

                {/* Unmatched leads: name matching runs at 70% confidence, and an
                    unmatched student is about to silently receive no grade. */}
                {unmatched.length > 0 && (
                  <div className="alert alert-warning">
                    <strong>{unmatched.length} unmatched</strong> — these students have
                    lottery points but no Canvas match, and will not be graded:
                    <ul className="mb-0 mt-1">
                      {unmatched.map((u) => (
                        <li key={u.name}>
                          {u.name} ({u.calls} call{u.calls === 1 ? "" : "s"}, {u.points} pts)
                          {u.bestMatch && (
                            <span className="text-muted">
                              {" "}
                              — closest: {u.bestMatch} ({u.bestScore}%)
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!assignmentId && (
                  <div className="alert alert-info">
                    No lottery assignment is configured for this course. Submitting
                    will find or create one in Canvas.
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
            )}
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
                disabled={students.length === 0}
              >
                Submit {students.length} grades to Canvas
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
  course: PropTypes.string.isRequired,
  assignmentId: PropTypes.number,
  onClose: PropTypes.func.isRequired,
};
