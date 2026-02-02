import React from "react";
import PropTypes from "prop-types";
import LotteryChart from "./LotteryChart";

function LotteryResultsFromMongo({
  grades,
  curve = "basis",
  rangeOpacity = 0.6,
  showStudentLines = false,
  studentCode = "",
}) {
  return (
    <div className="w-100">
      <LotteryChart
        grades={grades || []}
        curve={curve}
        rangeOpacity={rangeOpacity}
        showStudentLines={showStudentLines}
        studentCode={studentCode}
      />
    </div>
  );
}

LotteryResultsFromMongo.propTypes = {
  grades: PropTypes.array,
  curve: PropTypes.string,
  rangeOpacity: PropTypes.number,
  showStudentLines: PropTypes.bool,
  studentCode: PropTypes.string,
};

export default LotteryResultsFromMongo;
