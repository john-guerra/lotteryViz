import React, { useRef, useEffect } from "react";
import PropTypes from "prop-types";
import * as d3 from "d3";
import "./BubbleForce.css";

const PADDING = 1.5;

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
 * Return text fill and stroke colors for readable contrast on a given background.
 * Uses paint-order: stroke to render a thin halo behind the text.
 */
function textColorsFor(bgColor) {
  const c = d3.color(bgColor);
  if (!c) return { fill: "#222", stroke: "#fff" };
  const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  return lum < 0.45
    ? { fill: "#fff", stroke: "rgba(255,255,255,0.6)" }
    : { fill: "#222", stroke: "rgba(255,255,255,0.7)" };
}

const BubbleForce = ({
  students,
  selectedStudent,
  width,
  height,
  adjust,
  radiusScale: radiusFactor = 1.0,
  onBubbleClick,
}) => {
  const svgRef = useRef();
  const simRef = useRef(null);
  const mergedRef = useRef(null);
  const clickRef = useRef(onBubbleClick);
  clickRef.current = onBubbleClick;

  // Effect 1: Build/rebuild simulation when data, dimensions, or sizing change
  useEffect(() => {
    if (!students.length) return;

    const svg = d3.select(svgRef.current);
    const cx = width / 2;
    const cy = height / 2;

    const n = students.length;
    const viewArea = width * height;
    const fillFraction = 0.45;
    const areaBudget = viewArea * fillFraction;

    const uniformSize = !adjust;
    const maxProb = d3.max(students, (d) => d.probability) || 1;

    // Compute proportional radii then normalize so total area = areaBudget
    const relScale = d3.scaleSqrt().domain([0, maxProb]).range([0.5, 1.5]);
    const rawRadii = students.map((s) =>
      uniformSize ? 1.0 : relScale(s.probability)
    );
    const rawArea = rawRadii.reduce((sum, r) => sum + Math.PI * r * r, 0);
    const rScale = Math.sqrt(areaBudget / rawArea) * radiusFactor;
    const MIN_R = 12;

    // Color scale: count -> sequential purple
    const maxCount = Math.max(d3.max(students, (d) => d.count) || 1, 10);
    const colorScale = d3
      .scaleSequential((t) => d3.interpolatePurples(0.15 + t * 0.85))
      .domain([0, maxCount]);

    // Attach radius to each node
    const nodes = students.map((s, i) => ({
      ...s,
      r: Math.max(MIN_R, rawRadii[i] * rScale),
    }));

    if (simRef.current) {
      simRef.current.stop();
    }

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
      .attr("class", "bubble")
      .style("cursor", (d) => (d.drawn ? "default" : "pointer"))
      .on("click", function (d) {
        if (clickRef.current) clickRef.current(d);
      });

    enter.append("circle");
    enter.append("text").attr("class", "bubble-name");
    enter.append("text").attr("class", "bubble-count");

    const merged = enter.merge(bubbles);
    mergedRef.current = merged;

    merged
      .select("circle")
      .attr("r", (d) => d.r)
      .attr("fill", (d) => colorScale(d.count))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .attr("opacity", (d) => (d.drawn ? 0.3 : 1));

    // Name labels
    merged.select(".bubble-name").each(function (d) {
      const text = d3.select(this);
      const fontSize = Math.max(7, d.r / 3.5);
      const lines = splitName(d.name, d.r, fontSize);
      const totalLines = lines.length + 1;
      const lineHeight = fontSize * 1.2;
      const startY = -(totalLines - 1) * lineHeight / 2;
      const colors = textColorsFor(colorScale(d.count));

      text
        .attr("text-anchor", "middle")
        .attr("font-size", fontSize + "px")
        .attr("fill", colors.fill)
        .attr("stroke", colors.stroke)
        .attr("stroke-width", fontSize < 10 ? "2px" : "2.5px")
        .attr("paint-order", "stroke")
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

    // Count label
    merged.select(".bubble-count").each(function (d) {
      const text = d3.select(this);
      const fontSize = Math.max(7, d.r / 3.5);
      const nameLines = splitName(d.name, d.r, fontSize);
      const totalLines = nameLines.length + 1;
      const lineHeight = fontSize * 1.2;
      const startY = -(totalLines - 1) * lineHeight / 2;
      const countY = startY + nameLines.length * lineHeight;
      const colors = textColorsFor(colorScale(d.count));

      text
        .attr("text-anchor", "middle")
        .attr("font-size", fontSize + "px")
        .attr("fill", colors.fill)
        .attr("stroke", colors.stroke)
        .attr("stroke-width", fontSize < 10 ? "2px" : "2.5px")
        .attr("paint-order", "stroke")
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

    // "Already called" legend
    const drawnLeg = svg.append("g")
      .attr("class", "legend")
      .attr("transform", `translate(${width - 130}, ${height - 50})`);
    const drawnR = 7;
    drawnLeg.append("circle").attr("cx", drawnR).attr("cy", 0).attr("r", drawnR)
      .attr("fill", colorScale(5)).attr("opacity", 0.3).attr("stroke", "#fff").attr("stroke-width", 1);
    drawnLeg.append("text").text("= already called today")
      .attr("x", drawnR * 2 + 4).attr("y", 3)
      .attr("font-size", "8px").attr("fill", "#999");

    sim.on("tick", () => {
      // Clamp positions so bubbles stay within the viewport
      nodes.forEach((d) => {
        d.x = Math.max(d.r, Math.min(width - d.r, d.x));
        d.y = Math.max(d.r, Math.min(height - d.r, d.y));
      });
      merged.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      sim.stop();
    };
  }, [students, width, height, radiusFactor, adjust]);

  // Effect 2: Update selection styling without rebuilding simulation
  useEffect(() => {
    const merged = mergedRef.current;
    if (!merged) return;

    const selName = selectedStudent?.name;

    merged
      .select("circle")
      .attr("stroke", (d) => (d.name === selName ? "gold" : "#fff"))
      .attr("stroke-width", (d) => (d.name === selName ? 3 : 1.5))
      .classed("bubble-pulse", (d) => d.name === selName);

    // Reheat briefly for a subtle nudge on selection
    if (selName && simRef.current) {
      simRef.current.alpha(0.15).restart();
    }
  }, [selectedStudent]);

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
  selectedStudent: PropTypes.object,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  adjust: PropTypes.bool,
  radiusScale: PropTypes.number,
  onBubbleClick: PropTypes.func,
};

export default BubbleForce;
