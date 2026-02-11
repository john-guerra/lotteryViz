import React, { useRef, useEffect } from "react";
import PropTypes from "prop-types";
import * as d3 from "d3";
import cloud from "d3-cloud";
import "./WordCloud.css";

/**
 * Return "white" or "#222" depending on perceived brightness of a color.
 */
function textColorForBg(bgColor) {
  const c = d3.color(bgColor);
  if (!c) return "#222";
  const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  return lum < 0.55 ? "#fff" : "#222";
}

const WordCloud = ({
  students,
  studentsLeft,
  selectedStudent,
  drawnMap,
  width,
  height,
  adjust,
}) => {
  const svgRef = useRef();

  useEffect(() => {
    if (!students.length || !width || !height) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Color scale: count -> cool-to-warm (same as BubbleForce)
    // Anchor domain floor at 10 so colors don't remap as counts trickle in
    const maxCount = Math.max(d3.max(students, (d) => d.count) || 1, 10);
    const colorScale = d3
      .scaleSequential(d3.interpolateRdYlBu)
      .domain([maxCount, 0]);

    // Font size scale: probability -> word size
    // When adjust is off, all probabilities are equal — use uniform size
    const uniformSize = !adjust;
    const minFont = Math.max(10, Math.min(14, height / 40));
    const maxFont = Math.max(minFont + 4, Math.min(48, height / 10));

    const fontScale = d3
      .scaleSqrt()
      .domain([0, d3.max(students, (d) => d.probability) || 1])
      .range([minFont, maxFont]);

    const uniformFont = (minFont + maxFont) / 2;

    const words = students.map((s) => ({
      text: s.name,
      size: uniformSize ? uniformFont : fontScale(s.probability),
      count: s.count,
      drawn: s.drawn,
      isSelected: selectedStudent && s.name === selectedStudent.name,
    }));

    const layout = cloud()
      .size([width, height])
      .words(words)
      .padding(4)
      .rotate(() => (Math.random() > 0.65 ? 90 : 0))
      .font("sans-serif")
      .fontSize((d) => d.size)
      .on("end", draw);

    layout.start();

    function draw(drawnWords) {
      const g = svg
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${width / 2},${height / 2})`);

      g.selectAll("text")
        .data(drawnWords)
        .enter()
        .append("text")
        .attr("class", (d) => {
          let cls = "cloud-word";
          if (d.drawn) cls += " cloud-drawn";
          if (d.isSelected) cls += " cloud-selected";
          return cls;
        })
        .style("font-size", (d) => d.size + "px")
        .style("font-family", "sans-serif")
        .style("font-weight", (d) => (d.isSelected ? "bold" : "normal"))
        .style("fill", (d) => {
          if (d.isSelected) return "gold";
          return colorScale(d.count);
        })
        .style("stroke", (d) => {
          if (d.isSelected) {
            // Outline for readability on gold text
            return textColorForBg("gold") === "#fff" ? "#333" : "#fff";
          }
          return "none";
        })
        .style("stroke-width", (d) => (d.isSelected ? "0.5px" : "0"))
        .style("opacity", (d) => (d.drawn && !d.isSelected ? 0.25 : 1))
        .attr("text-anchor", "middle")
        .attr("transform", (d) => `translate(${d.x},${d.y}) rotate(${d.rotate})`)
        .text((d) => d.text);

      // Legend
      const legend = svg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(8, ${height - 30})`);

      const legendW = 80;
      const legendH = 10;
      const defs = svg.append("defs");
      const grad = defs.append("linearGradient").attr("id", "cloudColorGrad");
      grad.append("stop").attr("offset", "0%").attr("stop-color", colorScale(0));
      grad.append("stop").attr("offset", "100%").attr("stop-color", colorScale(maxCount));

      legend.append("rect")
        .attr("width", legendW).attr("height", legendH)
        .attr("fill", "url(#cloudColorGrad)")
        .attr("rx", 2);
      legend.append("text").text("0").attr("y", legendH + 11)
        .attr("font-size", "8px").attr("fill", "#666");
      legend.append("text").text(maxCount).attr("x", legendW).attr("y", legendH + 11)
        .attr("text-anchor", "end").attr("font-size", "8px").attr("fill", "#666");
      legend.append("text").text("Color = times called").attr("y", -4)
        .attr("font-size", "8px").attr("fill", "#999");

      if (!uniformSize) {
        legend.append("text")
          .text("Word size = selection chance")
          .attr("x", legendW + 16).attr("y", -4)
          .attr("font-size", "8px").attr("fill", "#999");
      }
    }
  }, [students, selectedStudent, drawnMap, width, height, adjust, studentsLeft]);

  return (
    <svg ref={svgRef} className="WordCloud" width={width} height={height} />
  );
};

WordCloud.propTypes = {
  students: PropTypes.array.isRequired,
  studentsLeft: PropTypes.array.isRequired,
  selectedStudent: PropTypes.object,
  drawnMap: PropTypes.object.isRequired,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  adjust: PropTypes.bool,
};

export default WordCloud;
