import React, { useRef, useEffect } from "react";
import PropTypes from "prop-types";
import * as d3 from "d3";
import "./RadialWheel.css";

const RadialWheel = ({
  students,
  studentsLeft,
  selectedStudent,
  drawnMap,
  allOptions,
  dCounts,
  avoidRepetition,
  width,
  height,
}) => {
  const containerRef = useRef();
  const angleScaleRef = useRef(d3.scaleLinear().range([0, 360]));
  const needsResetRef = useRef(true);

  // Reset the angle scale when the underlying data changes
  // (toggling controls, new options, etc.)
  const prevOptionsLenRef = useRef(null);
  useEffect(() => {
    if (prevOptionsLenRef.current !== allOptions.length) {
      needsResetRef.current = true;
      prevOptionsLenRef.current = allOptions.length;
    }
  }, [allOptions.length]);

  useEffect(() => {
    if (!containerRef.current || allOptions.length === 0) return;

    const angleScale = angleScaleRef.current;
    const options = allOptions;

    angleScale.domain([0, options.length]);

    if (needsResetRef.current) {
      angleScale.range([0, 360]);
      needsResetRef.current = false;
    }

    // If a student was just selected, rotate the wheel so they land at 0
    if (selectedStudent) {
      const selAngle = angleScale(selectedStudent.id);
      const prevRange = angleScale.range();
      angleScale.range([prevRange[0] - selAngle, prevRange[1] - selAngle]);
    }

    const actualWidth = containerRef.current.clientWidth || width;

    const svg = d3
      .select(containerRef.current)
      .selectAll("svg")
      .data([options])
      .join("svg")
      .attr("width", actualWidth)
      .attr("height", height);

    const optionsSel = svg.selectAll(".option").data(options, (d) => d.id);

    const translate = (sel) =>
      sel.attr("transform", (d) => {
        const xOff = actualWidth / 2 - 2 * options.length;
        return (
          "translate(" + xOff + "," + height / 2 + ") " +
          "rotate(" + angleScale(d.id) + ") " +
          "translate(" + 2 * options.length + ",0)"
        );
      });

    optionsSel
      .join("text")
      .classed("option", true)
      .classed("drawn", (d) => avoidRepetition && !!drawnMap[d.name])
      .classed("selected", (d) => d.id === selectedStudent?.id)
      .attr("id", (d) => "id" + d.id)
      .text((d) => `${d.name} ${(dCounts.get(d.name)?.count ?? 1) - 1}`)
      .transition()
      .duration(1000)
      .call(translate);
  }, [allOptions, selectedStudent, drawnMap, avoidRepetition, dCounts, width, height]);

  return <div className="RadialWheel" ref={containerRef} />;
};

RadialWheel.propTypes = {
  students: PropTypes.array.isRequired,
  studentsLeft: PropTypes.array.isRequired,
  selectedStudent: PropTypes.object,
  drawnMap: PropTypes.object.isRequired,
  allOptions: PropTypes.array.isRequired,
  dCounts: PropTypes.object.isRequired,
  avoidRepetition: PropTypes.bool.isRequired,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
};

export default RadialWheel;
