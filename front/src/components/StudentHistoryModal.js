import React, { useMemo } from "react";
import PropTypes from "prop-types";

function StudentHistoryModal({ show, onClose, studentName, allGrades }) {
  const studentHistory = useMemo(() => {
    if (!studentName || !allGrades) return [];

    const studentGrades = allGrades.filter((g) => g.name === studentName);

    // Sort by date ascending
    const sorted = [...studentGrades].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );

    // Calculate accumulated totals
    let accum = 0;
    return sorted.map((g) => {
      accum += g.grade;
      const date = new Date(g.timestamp);
      return {
        date: date.toLocaleDateString(),
        time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        points: g.grade,
        accumulated: accum,
        timestamp: g.timestamp,
      };
    });
  }, [studentName, allGrades]);

  if (!show) return null;

  return (
    <div
      className="modal show d-block"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Points History: {studentName}</h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
              aria-label="Close"
            ></button>
          </div>
          <div className="modal-body">
            {studentHistory.length === 0 ? (
              <p className="text-muted">No history available for this student.</p>
            ) : (
              <div className="table-responsive" style={{ maxHeight: "400px" }}>
                <table className="table table-sm">
                  <thead className="table-light sticky-top">
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Points</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentHistory.map((entry, idx) => (
                      <tr key={idx}>
                        <td>{entry.date}</td>
                        <td>{entry.time}</td>
                        <td
                          className={
                            entry.points > 0
                              ? "text-success"
                              : entry.points < 0
                              ? "text-danger"
                              : ""
                          }
                        >
                          {entry.points > 0 ? `+${entry.points}` : entry.points}
                        </td>
                        <td>
                          <strong>{entry.accumulated}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <div className="me-auto text-muted">
              Total entries: {studentHistory.length}
            </div>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

StudentHistoryModal.propTypes = {
  show: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  studentName: PropTypes.string,
  allGrades: PropTypes.array,
};

export default StudentHistoryModal;
