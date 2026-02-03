import React, { useRef, useEffect, useMemo, useState } from "react";
import * as d3 from "d3";
import PropTypes from "prop-types";
import { useSelection } from "../context/SelectionContext";
import { calculateMedian } from "../LotteryChart";


function groupBy(array, keyFn) {
  const map = new Map();
  for (const item of array) {
    const key = keyFn(item);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(item);
  }
  return map;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function buildAccumPoints(grades, roster = null) {
  if (!grades || !grades.length) return { accumPoints: [], dates: [], studentIdMap: {} };

  const processed = grades.map((g) => ({
    ...g,
    parsedDate: new Date(g.timestamp),
    dateStr: formatDate(g.timestamp),
  }));

  processed.sort((a, b) => a.parsedDate - b.parsedDate);
  const uniqueDates = [...new Set(processed.map((g) => g.dateStr))];

  // Date string to timestamp map (use first occurrence)
  const dateToTimestamp = {};
  for (const g of processed) {
    if (!dateToTimestamp[g.dateStr]) {
      dateToTimestamp[g.dateStr] = g.parsedDate;
    }
  }

  // Determine student list: use roster if provided, otherwise from grades
  const rosterSet = roster ? new Set(roster) : null;
  const studentsFromGrades = [...new Set(processed.map(g => g.name))];
  const studentList = roster || studentsFromGrades;

  // Filter to only roster students if roster provided
  const filteredStudents = rosterSet
    ? studentList.filter(name => rosterSet.has(name))
    : studentList;

  // Build student ID map
  const studentIdMap = {};
  filteredStudents.forEach((name, index) => {
    studentIdMap[name] = `S${index}`;
  });

  // Build grade lookup by student and date (only for roster students)
  const studentGradesByDate = new Map();
  for (const name of filteredStudents) {
    studentGradesByDate.set(name, new Map());
  }
  for (const g of processed) {
    if (studentGradesByDate.has(g.name)) {
      const gradesByDate = studentGradesByDate.get(g.name);
      const existing = gradesByDate.get(g.dateStr) || 0;
      gradesByDate.set(g.dateStr, existing + g.grade);
    }
  }

  // Build results: each student has a point on EVERY date
  const results = [];
  for (const [name, gradesByDate] of studentGradesByDate) {
    const studentId = studentIdMap[name];
    let accum = 0;

    for (const date of uniqueDates) {
      const pointsToday = gradesByDate.get(date) || 0;
      accum += pointsToday;

      results.push({
        ID: studentId,
        name: name,
        date: date,
        parsedDate: dateToTimestamp[date],
        accum: accum,
        points: pointsToday,
      });
    }
  }

  return { accumPoints: results, dates: uniqueDates, studentIdMap };
}

function buildDecilesByDate(accumPoints, dates, n = 50, adjustment = 0) {
  const byDate = groupBy(accumPoints, (d) => d.date);
  const decilesNumbers = d3.range(0, 100 + 100 / n, 100 / n);

  return dates.map((date) => {
    const values = byDate.get(date) || [];
    const accums = values.map((v) => v.accum).sort((a, b) => a - b);

    const deciles = {};
    for (const q of decilesNumbers) {
      deciles[q] = (d3.quantile(accums, q / 100) || 0) - adjustment;
    }
    deciles.median = (d3.median(accums) || 0) - adjustment;

    return [date, deciles];
  });
}

const WIDTH = 800;
const HEIGHT = 450;

function AdminLotteryChart({ grades, roster = null, rangeOpacity = 0.6, onStudentIdMapReady, studentName = "" }) {
  const svgRef = useRef();
  const brushRef = useRef();
  const { selectedStudents, highlightedStudent, setSelectionFromBrush, setHighlightedStudent, toggleStudent } = useSelection();
  const [hoveredTickStudent, setHoveredTickStudent] = useState(null);

  const { accumPoints, dates, studentIdMap } = useMemo(() => {
    return buildAccumPoints(grades, roster);
  }, [grades, roster]);

  // Notify parent of studentIdMap when it changes
  useEffect(() => {
    if (onStudentIdMapReady && Object.keys(studentIdMap).length > 0) {
      onStudentIdMapReady(studentIdMap);
    }
  }, [studentIdMap, onStudentIdMapReady]);

  // Get final accumulated points per student for brush selection
  const studentFinalAccum = useMemo(() => {
    if (!accumPoints.length) return [];

    const byStudent = groupBy(accumPoints, (d) => d.ID);
    return Array.from(byStudent, ([id, records]) => {
      const sorted = [...records].sort((a, b) => a.parsedDate - b.parsedDate);
      const lastRecord = sorted[sorted.length - 1];
      return {
        id,
        name: lastRecord.name,
        finalAccum: lastRecord.accum,
      };
    });
  }, [accumPoints]);

  // Resolve studentName to ID
  const searchedStudentId = useMemo(() => {
    if (!studentName || !studentIdMap) return null;
    // Exact match first
    if (studentIdMap[studentName]) return studentIdMap[studentName];
    // Case-insensitive partial match
    const lowerName = studentName.toLowerCase();
    const matchedName = Object.keys(studentIdMap).find(name =>
      name.toLowerCase().includes(lowerName)
    );
    return matchedName ? studentIdMap[matchedName] : null;
  }, [studentName, studentIdMap]);

  useEffect(() => {
    if (!grades || !grades.length || !accumPoints.length || !dates.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 20, right: 120, bottom: 70, left: 60 };
    const iwidth = WIDTH - margin.left - margin.right;
    const iheight = HEIGHT - margin.top - margin.bottom;

    const n = 50;
    const adjustment = 0;
    const decilesByDate = buildDecilesByDate(accumPoints, dates, n, adjustment);
    const decilesNumbers = d3.range(0, 100 + 100 / n, 100 / n);

    const nestedAccumPoints = groupBy(accumPoints, (d) => d.date);
    const nestedAccumPointsByID = groupBy(accumPoints, (d) => d.ID);

    const x = d3.scalePoint().domain(dates).range([0, iwidth]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(accumPoints, (d) => d.accum)])
      .nice()
      .range([iheight, 0]);

    const riskRangeColor = d3.scaleSequential(d3.interpolateRdBu).domain([-20, 120]);
    const boxColor = d3.scaleSequential(d3.interpolatePiYG).domain([-6, 6]);

    // Basis for background curves, monotoneX for student lines
    const backgroundCurve = d3.curveBasis;
    const studentCurve = d3.curveMonotoneX;

    const referenceLine = d3
      .line()
      .y(([, d]) => y(d.median))
      .x(([date]) => x(date))
      .curve(backgroundCurve);

    const referenceArea = d3
      .area()
      .y0((d) => y(d.y0))
      .y1((d) => y(d.y1))
      .x((d) => x(d.date))
      .curve(backgroundCurve);

    const studentLine = d3
      .line()
      .y((d) => y(d.accum))
      .x((d) => x(d.date))
      .curve(studentCurve);

    function getDecilesRange(i) {
      return decilesByDate.map(([date, deciles]) => ({
        date,
        y0: deciles[decilesNumbers[i]],
        y1: deciles[decilesNumbers[i + 1]],
      }));
    }

    svg
      .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("width", "100%")
      .style("min-height", "40vh")
      .style("max-height", "60vh");

    const gDrawing = svg
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // Draw percentile bands
    const decilePaths = gDrawing
      .selectAll("path.deciles")
      .data(decilesNumbers.slice(0, -1));

    decilePaths
      .enter()
      .append("path")
      .attr("class", "decile")
      .attr("d", (d, i) => referenceArea(getDecilesRange(i)))
      .attr("fill", (d) => riskRangeColor(d))
      .attr("opacity", rangeOpacity);

    // Draw median reference line
    gDrawing
      .append("path")
      .attr("class", "referenceLine")
      .attr("d", referenceLine(decilesByDate))
      .style("stroke", "#aaa")
      .style("fill", "none")
      .style("stroke-width", "3px");

    // Add median label
    const classMedian = calculateMedian(grades, roster);
    const lastDecileData = decilesByDate[decilesByDate.length - 1];
    if (lastDecileData) {
      const [lastDate, lastDeciles] = lastDecileData;
      const medianDisplay = Number.isInteger(classMedian) ? classMedian : classMedian.toFixed(1);

      gDrawing
        .append("text")
        .text(`Class median: ${medianDisplay}`)
        .style("text-anchor", "start")
        .style("fill", "#777")
        .style("font-size", "10pt")
        .attr("x", x(lastDate) + 5)
        .attr("y", y(lastDeciles.median) - 3);
    }

    // Y axis
    gDrawing
      .append("g")
      .call(d3.axisLeft(y).ticks(5).tickSize(-iwidth))
      .attr("font-size", "10pt")
      .call((gAxis) => {
        gAxis.selectAll(".domain").remove();
        gAxis
          .selectAll(".tick > line")
          .style("stroke", "#777")
          .style("stroke-dasharray", "1 5");
      })
      .append("text")
      .text("Accumulated points")
      .attr("fill", "black")
      .attr("dy", -10)
      .attr("transform", "rotate(90)")
      .attr("font-size", "10pt")
      .style("text-anchor", "start");

    // X axis
    gDrawing
      .append("g")
      .call(d3.axisBottom(x))
      .attr("transform", `translate(0, ${iheight})`)
      .call((xAxis) =>
        xAxis
          .selectAll(".tick > text")
          .attr("text-anchor", "end")
          .attr("transform", "rotate(-30)")
      )
      .append("text")
      .text("Date")
      .attr("fill", "black")
      .attr("x", iwidth)
      .attr("dy", -10)
      .attr("font-size", "10pt")
      .style("text-anchor", "end");

    // Data group
    const gData = gDrawing.append("g").attr("class", "data");

    // Determine which students to show lines for
    const studentsToShow = new Set([
      ...selectedStudents,
      highlightedStudent,
      hoveredTickStudent,
      searchedStudentId,
    ].filter(Boolean));

    // Draw tick marks for each student per date (clickable)
    const nestedArray = Array.from(nestedAccumPoints);
    const dateGroups = gData
      .selectAll(".date")
      .data(nestedArray)
      .enter()
      .append("g")
      .attr("class", "date");

    dateGroups
      .selectAll("line.tick")
      .data((row) => row[1])
      .enter()
      .append("line")
      .attr("class", "tick")
      .attr("y1", (d) => {
        d.jitter = Math.random() * 10 - 5;
        return y(d.accum) + d.jitter;
      })
      .attr("y2", (d) => y(d.accum) + d.jitter)
      .attr("x1", (d) => x(d.date) - 5)
      .attr("x2", (d) => x(d.date) + 5)
      .style("stroke", (d) => {
        if (d.ID === highlightedStudent || d.ID === hoveredTickStudent) return "#ffc107";
        if (selectedStudents.includes(d.ID)) return "#0d6efd";
        return "#999";
      })
      .style("stroke-width", (d) => {
        if (d.ID === highlightedStudent || d.ID === hoveredTickStudent || selectedStudents.includes(d.ID)) return 2;
        return 1;
      })
      .style("opacity", 0.6)
      .style("cursor", "pointer")
      .on("click", function (d) {
        d3.event.stopPropagation();
        toggleStudent(d.ID);
      })
      .on("mouseenter", function (d) {
        setHoveredTickStudent(d.ID);
        setHighlightedStudent(d.ID);
      })
      .on("mouseleave", function () {
        setHoveredTickStudent(null);
        setHighlightedStudent(null);
      });

    // Only draw lines for selected/highlighted/searched students
    if (studentsToShow.size > 0) {
      const filteredStudentData = Array.from(nestedAccumPointsByID)
        .filter(([id]) => studentsToShow.has(id));

      gData
        .selectAll(".studentLine")
        .data(filteredStudentData)
        .enter()
        .append("path")
        .attr("class", "studentLine")
        .attr("data-id", ([id]) => id)
        .attr("d", ([, values]) => studentLine(values))
        .attr("fill", "none")
        .attr("stroke", ([id]) => {
          if (id === highlightedStudent || id === hoveredTickStudent) return "#ffc107";
          if (id === searchedStudentId) return "#28a745";
          if (selectedStudents.includes(id)) return "#0d6efd";
          return "#777";
        })
        .attr("stroke-width", ([id]) => {
          if (id === highlightedStudent || id === hoveredTickStudent) return 3;
          if (id === searchedStudentId) return 2.5;
          if (selectedStudents.includes(id)) return 2;
          return 1;
        })
        .attr("opacity", 0.8)
        .style("cursor", "pointer")
        .on("click", function ([id]) {
          d3.event.stopPropagation();
          toggleStudent(id);
        })
        .on("mouseenter", function ([id]) {
          setHighlightedStudent(id);
        })
        .on("mouseleave", function () {
          setHighlightedStudent(null);
        });
    }

    // Draw circles for searched student
    if (searchedStudentId) {
      const searchedGrades = accumPoints.filter((d) => d.ID === searchedStudentId);
      if (searchedGrades.length > 0) {
        const boxes = gData
          .selectAll("g.boxes")
          .data(searchedGrades)
          .enter()
          .append("g")
          .attr("class", "boxes")
          .attr("transform", (d) => `translate(${x(d.date)}, ${y(d.accum)})`);

        boxes
          .append("circle")
          .attr("r", 8)
          .style("stroke", "white")
          .style("fill", (d) => boxColor(d.points || 0));

        boxes
          .append("text")
          .attr("dx", 10)
          .attr("dy", 4)
          .style("font-size", "8pt")
          .text((d) => `${d.accum}`);
      }
    }

    // Brush for selection
    const brushGroup = gDrawing
      .append("g")
      .attr("class", "brush")
      .attr("transform", `translate(${iwidth + 10}, 0)`);

    const brush = d3
      .brushY()
      .extent([
        [0, 0],
        [30, iheight],
      ])
      .on("end", function () {
        const selection = d3.event.selection;
        if (!selection) {
          setSelectionFromBrush([]);
          return;
        }
        const [y0, y1] = selection;
        const maxAccum = y.invert(y0);
        const minAccum = y.invert(y1);

        const selected = studentFinalAccum.filter(
          (s) => s.finalAccum >= minAccum && s.finalAccum <= maxAccum
        );
        setSelectionFromBrush(selected.map((s) => s.id));
      });

    brushGroup.call(brush);
    brushRef.current = brushGroup;

    // Brush axis label
    gDrawing
      .append("text")
      .attr("x", iwidth + 25)
      .attr("y", -5)
      .attr("text-anchor", "middle")
      .attr("font-size", "9pt")
      .attr("fill", "#666")
      .text("Brush");

  }, [grades, roster, accumPoints, dates, rangeOpacity, selectedStudents, highlightedStudent, hoveredTickStudent, searchedStudentId, setSelectionFromBrush, setHighlightedStudent, toggleStudent, studentFinalAccum]);

  return (
    <svg
      ref={svgRef}
      className="w-100"
      style={{
        fontFamily: '"Trebuchet MS", Verdana, sans-serif',
        fontSize: "9pt",
      }}
    />
  );
}

AdminLotteryChart.propTypes = {
  grades: PropTypes.array.isRequired,
  roster: PropTypes.array,
  rangeOpacity: PropTypes.number,
  onStudentIdMapReady: PropTypes.func,
  studentName: PropTypes.string,
};

export default AdminLotteryChart;
