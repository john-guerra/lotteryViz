import React, { useRef, useEffect } from "react";
import PropTypes from "prop-types";
import * as d3 from "d3";
import "./BubbleForce.css";

const PADDING = 3;

/**
 * Split a full name into lines that fit inside a circle of given radius.
 */
function splitName(name, radius, fontSize) {
  const words = name.split(" ");
  const charsPerLine = Math.max(4, Math.floor((2 * radius * 0.85) / (fontSize * 0.6)));
  const lines = [];
  let current = "";

  for (const word of words) {
    if (current && (current.length + 1 + word.length) > charsPerLine) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Return "white" or "#222" depending on perceived brightness of a hex/rgb color.
 */
function textColorFor(bgColor) {
  const c = d3.color(bgColor);
  if (!c) return "#222";
  // W3C relative luminance approximation
  const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  return lum < 0.55 ? "#fff" : "#222";
}

const BubbleForce = ({
  students,
  studentsLeft,
  selectedStudent,
  drawnMap,
  width,
  height,
  adjust,
  radiusScale: radiusFactor = 1.0,
}) => {
  const svgRef = useRef();
  const simRef = useRef(null);

  useEffect(() => {
    if (!students.length) return;

    const svg = d3.select(svgRef.current);
    const cx = width / 2;
    const cy = height / 2;

    // Compute radius bounds based on number of students and available area
    const n = students.length;
    const area = width * height;
    // Target: total bubble area fills ~55% of the SVG area
    const avgRadius = Math.sqrt((area * 0.55) / (n * Math.PI));
    const baseMin = Math.max(14, avgRadius * 0.5) * radiusFactor;
    const baseMax = Math.max(baseMin + 4, avgRadius * 1.6 * radiusFactor);

    // When adjust is off, all students have equal chance — use uniform radius
    const uniformSize = !adjust;
    const uniformR = (baseMin + baseMax) / 2;

    // Radius scale: probability -> circle size
    const radiusScaleFn = d3
      .scaleSqrt()
      .domain([0, d3.max(students, (d) => d.probability) || 1])
      .range([baseMin, baseMax]);

    // Color scale: count -> cool-to-warm
    // Anchor domain floor at 10 so colors don't remap as counts trickle in
    const maxCount = Math.max(d3.max(students, (d) => d.count) || 1, 10);
    const colorScale = d3
      .scaleSequential(d3.interpolateRdYlBu)
      .domain([maxCount, 0]);

    // Attach radius to each node
    const nodes = students.map((s) => ({
      ...s,
      r: uniformSize ? uniformR : radiusScaleFn(s.probability),
    }));

    // Create or update the simulation
    if (simRef.current) {
      simRef.current.stop();
    }

    // Adjust forces to match aspect ratio — weaken force along the longer axis
    // so bubbles spread to fill the available space
    const maxDim = Math.max(width, height);
    const xStrength = 0.03 * (height / maxDim);
    const yStrength = 0.03 * (width / maxDim);

    const sim = d3
      .forceSimulation(nodes)
      .force("center", d3.forceCenter(cx, cy))
      .force("x", d3.forceX(cx).strength(xStrength))
      .force("y", d3.forceY(cy).strength(yStrength))
      .force(
        "collide",
        d3.forceCollide((d) => d.r + PADDING).strength(0.8)
      )
      .alphaDecay(0.01)
      .velocityDecay(0.3);

    simRef.current = sim;

    // Bind data
    const bubbles = svg
      .selectAll("g.bubble")
      .data(nodes, (d) => d.name);

    const enter = bubbles
      .enter()
      .append("g")
      .attr("class", "bubble");

    enter.append("circle");
    enter.append("text").attr("class", "bubble-name");
    enter.append("text").attr("class", "bubble-count");

    const merged = enter.merge(bubbles);

    merged
      .select("circle")
      .attr("r", (d) => d.r)
      .attr("fill", (d) => colorScale(d.count))
      .attr("stroke", (d) =>
        selectedStudent && d.name === selectedStudent.name ? "gold" : "#fff"
      )
      .attr("stroke-width", (d) =>
        selectedStudent && d.name === selectedStudent.name ? 3 : 1.5
      )
      .attr("opacity", (d) => (d.drawn ? 0.3 : 1))
      .classed(
        "bubble-pulse",
        (d) => selectedStudent && d.name === selectedStudent.name
      );

    // Name labels: split into multiple lines via <tspan>
    merged.select(".bubble-name").each(function (d) {
      const text = d3.select(this);
      const fontSize = Math.max(7, d.r / 3.5);
      const lines = splitName(d.name, d.r, fontSize);
      const totalLines = lines.length + 1;
      const lineHeight = fontSize * 1.2;
      const startY = -(totalLines - 1) * lineHeight / 2;
      const fill = colorScale(d.count);

      text
        .attr("text-anchor", "middle")
        .attr("font-size", fontSize + "px")
        .attr("fill", textColorFor(fill))
        .attr("opacity", d.drawn ? 0.3 : 1);

      text.selectAll("tspan").remove();
      lines.forEach((line, i) => {
        text
          .append("tspan")
          .attr("x", 0)
          .attr("dy", i === 0 ? startY + "px" : lineHeight + "px")
          .text(line);
      });
    });

    // Count label on its own line below the name
    merged.select(".bubble-count").each(function (d) {
      const text = d3.select(this);
      const fontSize = Math.max(7, d.r / 3.5);
      const nameLines = splitName(d.name, d.r, fontSize);
      const totalLines = nameLines.length + 1;
      const lineHeight = fontSize * 1.2;
      const startY = -(totalLines - 1) * lineHeight / 2;
      const countY = startY + nameLines.length * lineHeight;
      const fill = colorScale(d.count);

      text
        .attr("text-anchor", "middle")
        .attr("font-size", fontSize + "px")
        .attr("fill", textColorFor(fill))
        .attr("opacity", d.drawn ? 0.3 : 0.7);

      text.selectAll("tspan").remove();
      text
        .append("tspan")
        .attr("x", 0)
        .attr("dy", countY + "px")
        .text(d.count);
    });

    bubbles.exit().remove();

    // --- Legend ---
    svg.selectAll("g.legend").remove();
    const legend = svg.append("g")
      .attr("class", "legend")
      .attr("transform", `translate(8, ${height - 50})`);

    // Color legend
    const legendW = 80;
    const legendH = 10;
    const defs = svg.selectAll("defs").data([0]).join("defs");
    defs.selectAll("#colorLegendGrad").remove();
    const grad = defs.append("linearGradient").attr("id", "colorLegendGrad");
    grad.append("stop").attr("offset", "0%").attr("stop-color", colorScale(0));
    grad.append("stop").attr("offset", "100%").attr("stop-color", colorScale(maxCount));

    legend.append("rect")
      .attr("width", legendW).attr("height", legendH)
      .attr("fill", "url(#colorLegendGrad)")
      .attr("rx", 2);
    legend.append("text").text("0").attr("y", legendH + 11).attr("font-size", "8px").attr("fill", "#666");
    legend.append("text").text(maxCount).attr("x", legendW).attr("y", legendH + 11)
      .attr("text-anchor", "end").attr("font-size", "8px").attr("fill", "#666");
    legend.append("text").text("Color = times called").attr("y", -4)
      .attr("font-size", "8px").attr("fill", "#999");

    // Size legend (only when adjust is on and probabilities vary)
    if (!uniformSize) {
      const sizeLeg = svg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${legendW + 30}, ${height - 50})`);
      const smallR = 5;
      const bigR = 10;
      sizeLeg.append("circle").attr("cx", smallR).attr("cy", 0).attr("r", smallR)
        .attr("fill", "none").attr("stroke", "#999");
      sizeLeg.append("circle").attr("cx", smallR * 2 + bigR + 6).attr("cy", 0).attr("r", bigR)
        .attr("fill", "none").attr("stroke", "#999");
      sizeLeg.append("text").text("Size = selection chance")
        .attr("y", -4 - bigR).attr("font-size", "8px").attr("fill", "#999");
      sizeLeg.append("text").text("lower").attr("x", smallR).attr("y", smallR + 11)
        .attr("text-anchor", "middle").attr("font-size", "7px").attr("fill", "#999");
      sizeLeg.append("text").text("higher").attr("x", smallR * 2 + bigR + 6).attr("y", bigR + 11)
        .attr("text-anchor", "middle").attr("font-size", "7px").attr("fill", "#999");
    }

    // Tick handler
    sim.on("tick", () => {
      merged.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    // Reheat briefly when selection changes
    if (selectedStudent) {
      sim.alpha(0.4).restart();
    }

    return () => {
      sim.stop();
    };
  }, [students, selectedStudent, drawnMap, width, height, studentsLeft, radiusFactor, adjust]);

  return (
    <svg
      ref={svgRef}
      className="BubbleForce"
      width={width}
      height={height}
    />
  );
};

BubbleForce.propTypes = {
  students: PropTypes.array.isRequired,
  studentsLeft: PropTypes.array.isRequired,
  selectedStudent: PropTypes.object,
  drawnMap: PropTypes.object.isRequired,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  adjust: PropTypes.bool,
  radiusScale: PropTypes.number,
};

export default BubbleForce;
