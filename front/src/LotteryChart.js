import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import PropTypes from "prop-types";

// d3 v5 compatible curves - defined outside component to avoid recreation
const CURVE_OPTIONS = {
  basis: d3.curveBasis,
  monotoneX: d3.curveMonotoneX,
  step: d3.curveStep,
  linear: d3.curveLinear,
};

/**
 * Group array by key function (d3 v5 compatible replacement for d3.group)
 */
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

/**
 * Calculate the median of accumulated points across all students.
 * This is exported so App.js can use the same calculation for the header.
 */
export function calculateMedian(grades) {
  if (!grades || !grades.length) return 0;

  // Group by student and calculate total accumulated points
  const byStudent = groupBy(grades, (d) => d.name);
  const studentTotals = Array.from(byStudent, ([, studentGrades]) => {
    return studentGrades.reduce((sum, g) => sum + g.grade, 0);
  });

  return d3.median(studentTotals) || 0;
}

/**
 * Format a timestamp to a date string for grouping
 */
function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Build accumulated points per student per date from raw grades
 */
function buildAccumPoints(grades) {
  if (!grades || !grades.length) return { accumPoints: [], dates: [] };

  // Parse timestamps and group by student
  const processed = grades.map((g) => ({
    ...g,
    parsedDate: new Date(g.timestamp),
    dateStr: formatDate(g.timestamp),
  }));

  // Sort all grades by date first to get consistent date ordering
  processed.sort((a, b) => a.parsedDate - b.parsedDate);

  // Get unique dates in order
  const uniqueDates = [...new Set(processed.map((g) => g.dateStr))];

  // Group by student
  const byStudent = groupBy(processed, (d) => d.name);

  const results = [];
  let studentIndex = 0;

  for (const [name, studentGrades] of byStudent) {
    // Create a student ID (anonymized)
    const studentId = `S${studentIndex}`;
    studentIndex++;

    // Sort student's grades by date
    const sorted = [...studentGrades].sort(
      (a, b) => a.parsedDate - b.parsedDate
    );

    // Accumulate points
    let accum = 0;
    for (const g of sorted) {
      accum += g.grade;
      results.push({
        ID: studentId,
        name: name,
        date: g.dateStr,
        parsedDate: g.parsedDate,
        accum: accum,
        points: g.grade,
      });
    }
  }

  return { accumPoints: results, dates: uniqueDates };
}

/**
 * Calculate percentiles (deciles) per date
 */
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

// Fixed internal dimensions for D3 calculations
const WIDTH = 800;
const HEIGHT = 450;

function LotteryChart({
  grades,
  curve = "monotoneX",
  rangeOpacity = 0.6,
  showStudentLines = false,
  studentCode = "",
}) {
  const svgRef = useRef();

  useEffect(() => {
    if (!grades || !grades.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Margins and dimensions
    const margin = { top: 20, right: 100, bottom: 70, left: 60 };
    const iwidth = WIDTH - margin.left - margin.right;
    const iheight = HEIGHT - margin.top - margin.bottom;

    // Build data
    const { accumPoints, dates } = buildAccumPoints(grades);
    if (!accumPoints.length || !dates.length) return;

    const n = 50;
    const adjustment = 0;
    const decilesByDate = buildDecilesByDate(accumPoints, dates, n, adjustment);
    const decilesNumbers = d3.range(0, 100 + 100 / n, 100 / n);

    // Nested data structures
    const nestedAccumPoints = groupBy(accumPoints, (d) => d.date);
    const nestedAccumPointsByID = groupBy(accumPoints, (d) => d.ID);

    // Scales
    const x = d3.scalePoint().domain(dates).range([0, iwidth]);
    const y = d3
      .scaleLinear()
      .domain([-adjustment, d3.max(accumPoints, (d) => d.accum)])
      .nice()
      .range([iheight, 0]);

    // Color scales
    const riskRangeColor = d3
      .scaleSequential(d3.interpolateRdBu)
      .domain([-20, 120]);
    const boxColor = d3
      .scaleSequential(d3.interpolatePiYG)
      .domain([-6, 6]);

    // Line/area generators
    const curveFunc = CURVE_OPTIONS[curve] || d3.curveMonotoneX;

    const referenceLine = d3
      .line()
      .y(([, d]) => y(d.median))
      .x(([date]) => x(date))
      .curve(curveFunc);

    const referenceArea = d3
      .area()
      .y0((d) => y(d.y0))
      .y1((d) => y(d.y1))
      .x((d) => x(d.date))
      .curve(curveFunc);

    const studentLine = d3
      .line()
      .y((d) => y(d.accum))
      .x((d) => x(d.date))
      .curve(curveFunc);

    // Helper function to get decile ranges
    function getDecilesRange(i) {
      return decilesByDate.map(([date, deciles]) => ({
        date,
        y0: deciles[decilesNumbers[i]],
        y1: deciles[decilesNumbers[i + 1]],
      }));
    }

    // Set up SVG with viewBox for responsive sizing
    svg
      .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("width", "100%")
      .style("min-height", "40vh")
      .style("max-height", "60vh")
      .style("overflow", "visible");

    // Add gradient definition
    const defs = svg.append("defs");
    const gradient = defs
      .append("linearGradient")
      .attr("id", "riskGradient")
      .attr("gradientTransform", "rotate(90)");

    d3.range(0, 10).forEach((s) => {
      gradient
        .append("stop")
        .attr("stop-color", riskRangeColor(s * 10))
        .attr("offset", `${s * 10}%`);
    });

    // Main drawing group
    const gDrawing = svg
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // Draw reference (percentile bands)
    const decilePaths = gDrawing
      .selectAll("path.deciles")
      .data(decilesNumbers.slice(0, -1));

    decilePaths
      .enter()
      .append("path")
      .attr("class", "decile")
      .attr("d", (d, i) => referenceArea(getDecilesRange(i)))
      .attr("fill", (d) => riskRangeColor(d))
      .attr("opacity", rangeOpacity)
      .append("title")
      .text((d) => `Percentile ${d}`);

    // Draw median reference line
    gDrawing
      .append("path")
      .attr("class", "referenceLine")
      .attr("d", referenceLine(decilesByDate))
      .style("stroke", "#aaa")
      .style("fill", "none")
      .style("stroke-width", "3px");

    // Calculate and display median label at the end of the median line
    const classMedian = calculateMedian(grades);
    const lastDecileData = decilesByDate[decilesByDate.length - 1];
    if (lastDecileData) {
      const [lastDate, lastDeciles] = lastDecileData;
      // Format to match header display (no decimal if whole number, otherwise 1 decimal)
      const medianDisplay = Number.isInteger(classMedian) ? classMedian : classMedian.toFixed(1);

      gDrawing
        .append("text")
        .text(
          `Class median${adjustment > 0 ? " -" + adjustment : ""}: ${medianDisplay}`
        )
        .style("text-anchor", "start")
        .style("fill", "#777")
        .style("font-size", "10pt")
        .attr("x", x(lastDate) + 5)
        .attr("y", y(lastDeciles.median) - 3);
    }

    // Draw axes
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

    // Draw tick marks for each student per date
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
      .style("stroke", "#999")
      .style("opacity", 0.6);

    // Draw student lines if enabled
    if (showStudentLines) {
      gData
        .selectAll(".studentLines")
        .data(Array.from(nestedAccumPointsByID))
        .enter()
        .append("path")
        .attr("class", "studentLines")
        .attr("d", ([, values]) => studentLine(values))
        .attr("fill", "none")
        .attr("stroke", "#777")
        .attr("opacity", 0.6);
    }

    // Draw selected student if code is provided
    if (studentCode) {
      const selectedGrades = accumPoints.filter((d) => d.ID === studentCode);
      if (selectedGrades.length === 0) {
        gData
          .append("text")
          .attr("x", iwidth / 2)
          .attr("y", 20)
          .style("font-size", "16pt")
          .style("fill", "firebrick")
          .style("text-anchor", "middle")
          .text("Code not found");
      } else {
        const boxes = gData
          .selectAll("g.boxes")
          .data(selectedGrades)
          .enter()
          .append("g")
          .attr("class", "boxes")
          .attr("transform", (d) => `translate(${x(d.date)}, ${y(d.accum)})`);

        boxes
          .append("circle")
          .attr("r", 10)
          .style("stroke", "white")
          .style("fill", (d) => boxColor(d.points || 0));

        boxes
          .append("text")
          .attr("dx", 12)
          .attr("dy", 5)
          .style("font-size", "8pt")
          .text((d) => `${d.accum}`);
      }
    }
  }, [grades, curve, rangeOpacity, showStudentLines, studentCode]);

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

LotteryChart.propTypes = {
  grades: PropTypes.array.isRequired,
  curve: PropTypes.string,
  rangeOpacity: PropTypes.number,
  showStudentLines: PropTypes.bool,
  studentCode: PropTypes.string,
};

export default LotteryChart;
