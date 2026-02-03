import React, { useState, useMemo } from "react";
import PropTypes from "prop-types";
import * as d3 from "d3";
import { useSelection } from "../context/SelectionContext";

// Inline styles for compact table and hover effects
const compactTableStyles = `
.compact-table tbody tr {
  height: 28px;
}
.compact-table td {
  padding: 0.15rem 0.5rem !important;
  vertical-align: middle;
}
.compact-table th {
  padding: 0.25rem 0.5rem !important;
}
.compact-table .view-btn {
  opacity: 0;
  transition: opacity 0.15s;
}
.compact-table tr:hover .view-btn {
  opacity: 1;
}
`;

function StudentTable({ counts, allGrades, onShowHistory, studentIdMap, anonymize = false }) {
  const { selectedStudents, highlightedStudent, toggleStudent, setHighlightedStudent } = useSelection();
  const [sortColumn, setSortColumn] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");

  // Build lookup of last 10 grades per student (sorted by timestamp desc)
  const last10ByStudent = useMemo(() => {
    if (!allGrades || !allGrades.length) return {};

    // Group grades by student name
    const byStudent = {};
    for (const g of allGrades) {
      if (!byStudent[g.name]) byStudent[g.name] = [];
      byStudent[g.name].push(g);
    }

    // For each student, sort by timestamp desc and take last 10
    const result = {};
    for (const [name, grades] of Object.entries(byStudent)) {
      const sorted = [...grades].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      result[name] = sorted.slice(0, 10).map(g => g.grade);
    }
    return result;
  }, [allGrades]);

  const studentData = useMemo(() => {
    if (!counts || !counts.length) return [];

    // Build student data from counts
    // API returns: { _id: name, count: number, sum: points }
    const data = counts.map((c) => {
      const name = c._id || c.name;
      // Find the student ID from the map (reverse lookup)
      const studentId = studentIdMap?.[name] || null;
      const calls = c.count || 0;
      const points = c.sum ?? c.points ?? 0;
      const last10 = last10ByStudent[name] || [];

      return {
        name: name,
        id: studentId,
        calls: calls,
        points: points,
        callsPerClass: calls > 0 ? (points / calls).toFixed(2) : "0.00",
        last10: last10,
      };
    });

    return data;
  }, [counts, studentIdMap, last10ByStudent]);

  // Calculate medians for color coding
  const { medianCalls, medianPoints, callsExtent, pointsExtent } = useMemo(() => {
    if (!studentData.length) return { medianCalls: 0, medianPoints: 0, callsExtent: [0, 1], pointsExtent: [0, 1] };

    const callsValues = studentData.map(s => s.calls);
    const pointsValues = studentData.map(s => s.points);

    return {
      medianCalls: d3.median(callsValues) || 0,
      medianPoints: d3.median(pointsValues) || 0,
      callsExtent: d3.extent(callsValues),
      pointsExtent: d3.extent(pointsValues),
    };
  }, [studentData]);

  // Color scale function - returns background color based on value relative to median
  const getCellColor = (value, median, extent) => {
    if (median === 0) return "transparent";
    // Create a scale centered on median
    // Values below median map to red tones, above to blue tones
    const min = extent[0];
    const max = extent[1];
    // Normalize to 0-1 where 0.5 is median
    let normalized;
    if (value <= median) {
      normalized = 0.5 * (value - min) / (median - min || 1);
    } else {
      normalized = 0.5 + 0.5 * (value - median) / (max - median || 1);
    }
    // interpolateRdBu goes from red (0) to white (0.5) to blue (1)
    const color = d3.interpolateRdBu(normalized);
    // Make the color semi-transparent for better readability
    return color.replace("rgb", "rgba").replace(")", ", 0.3)");
  };

  const sortedData = useMemo(() => {
    const sorted = [...studentData];
    sorted.sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];

      // Handle numeric vs string comparison
      if (sortColumn === "calls" || sortColumn === "points") {
        aVal = Number(aVal);
        bVal = Number(bVal);
      } else if (sortColumn === "callsPerClass") {
        aVal = parseFloat(aVal);
        bVal = parseFloat(bVal);
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [studentData, sortColumn, sortDirection]);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getSortIndicator = (column) => {
    if (sortColumn !== column) return "";
    return sortDirection === "asc" ? " \u25B2" : " \u25BC";
  };

  // Render last 10 grades as compact color-coded spans (blue/red scale)
  const renderLast10 = (grades) => {
    if (!grades || !grades.length) return <span style={{ color: "#999" }}>-</span>;

    return (
      <span style={{ fontFamily: "monospace", fontSize: "11px" }}>
        {grades.map((g, i) => {
          let color;
          let text;
          if (g < 0) {
            color = "#dc3545"; // red
            text = g.toString(); // includes minus sign
          } else if (g > 0) {
            color = "#0d6efd"; // blue
            text = g.toString();
          } else {
            color = "#6c757d"; // gray
            text = "0";
          }
          return (
            <span key={i} style={{ color }}>
              {text}
            </span>
          );
        })}
      </span>
    );
  };

  const getRowClassName = (student) => {
    const classes = [];
    if (student.id && selectedStudents.includes(student.id)) {
      classes.push("table-primary");
    }
    if (student.id && highlightedStudent === student.id) {
      classes.push("table-warning");
    }
    return classes.join(" ");
  };

  return (
    <>
      <style>{compactTableStyles}</style>
      <div className="table-responsive" style={{ overflowY: "auto", flex: 1 }}>
        <table className="table table-hover table-sm compact-table">
          <thead className="table-light sticky-top">
            <tr>
              <th
                style={{ cursor: "pointer" }}
                onClick={() => handleSort("name")}
              >
                Name{getSortIndicator("name")}
              </th>
              <th
                style={{ cursor: "pointer" }}
                onClick={() => handleSort("calls")}
              >
                # Calls{getSortIndicator("calls")}
              </th>
              <th
                style={{ cursor: "pointer" }}
                onClick={() => handleSort("points")}
              >
                Points{getSortIndicator("points")}
              </th>
              <th
                style={{ cursor: "pointer" }}
                onClick={() => handleSort("callsPerClass")}
              >
                Pts/Call{getSortIndicator("callsPerClass")}
              </th>
              <th>Last 10</th>
              <th style={{ width: "60px" }}></th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((student) => (
              <tr
                key={student.name}
                className={getRowClassName(student)}
                onClick={() => student.id && toggleStudent(student.id)}
                onMouseEnter={() => student.id && setHighlightedStudent(student.id)}
                onMouseLeave={() => setHighlightedStudent(null)}
                style={{ cursor: student.id ? "pointer" : "default" }}
              >
                <td>{anonymize ? (student.id || "?") : student.name}</td>
                <td style={{ backgroundColor: getCellColor(student.calls, medianCalls, callsExtent) }}>
                  {student.calls}
                </td>
                <td style={{ backgroundColor: getCellColor(student.points, medianPoints, pointsExtent) }}>
                  {student.points}
                </td>
                <td>{student.callsPerClass}</td>
                <td>{renderLast10(student.last10)}</td>
                <td>
                  <button
                    className="btn btn-sm btn-outline-secondary view-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowHistory(student.name);
                    }}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

StudentTable.propTypes = {
  counts: PropTypes.array.isRequired,
  allGrades: PropTypes.array.isRequired,
  onShowHistory: PropTypes.func.isRequired,
  studentIdMap: PropTypes.object,
  anonymize: PropTypes.bool,
};

export default StudentTable;
