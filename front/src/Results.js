import React, { useState } from "react";
// import PropTypes from "prop-types";

const Results = () => {
  const [todayGrades, setTodayGrades] = useState([]);

  const refreshGrades = () => {
    fetch("getGrades")
      .then((res) => res.json())
      .then((grades) => {
        setTodayGrades(grades);
      });
  };

  return (
    <div className="Results">
      <h1></h1>
    </div>
  );
};

Results.propTypes = {};

export default Results;
