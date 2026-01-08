import React, { useRef, useEffect, useState, useCallback } from "react";
import { Runtime, Inspector } from "@observablehq/runtime";
import notebookUrl from "@john-guerra/lottery-results-from-mongo";
import PropTypes from "prop-types";

function LotteryResultsFromMongo({
  courseName = "webdev_fall_2025",
  optionsDrawn,
}) {
  const viewofCourseNameRef = useRef();
  const lotteryChartRef = useRef();

  const [width, setWidth] = useState(600);

  useCallback((node) => {
    if (node !== null) {
      console.log(
        "Lottery viz width",
        node ? node.getBoundingClientRect().width - 100 : 400
      );
      setWidth(node ? node.getBoundingClientRect().width - 100 : 400);
    }
  }, []);

  useEffect(() => {
    console.log("update lottery viz");

    const runtime = new Runtime();
    const notebook = runtime.module(notebookUrl, (name) => {
      if (name === "viewof courseName")
        return new Inspector(viewofCourseNameRef.current);
      if (name === "lotteryChart")
        return new Inspector(lotteryChartRef.current);
      return [
        "lotteryMongo",
        "viewof lotteryDF",
        "lottery",
        "width",
        "defaultCourse",
      ].includes(name);
    });

    notebook.redefine("width", width);
    notebook.redefine("defaultCourse", courseName);

    console.log("courseName", viewofCourseNameRef.current);

    return () => runtime.dispose();
  }, [width, courseName, optionsDrawn]);

  return (
    <>
      <div ref={viewofCourseNameRef} />
      <div ref={lotteryChartRef} />
    </>
  );
}

LotteryResultsFromMongo.propTypes = {
  courseName: PropTypes.string.isRequired,
  optionsDrawn: PropTypes.array.isRequired,
};

export default LotteryResultsFromMongo;
