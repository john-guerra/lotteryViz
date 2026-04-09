import React from "react";
import PropTypes from "prop-types";
import LotteryChart from "./LotteryChart";

function LotteryResultsFromMongo({
  grades,
  roster = null,
  medianAdjustment = 0,
  rangeOpacity = 0.6,
  showStudentLines = false,
  studentCode = "",
  studentName = "",
}) {
  return (
    <div className="w-100">
      <LotteryChart
        grades={grades || []}
        roster={roster}
        medianAdjustment={medianAdjustment}
        rangeOpacity={rangeOpacity}
        showStudentLines={showStudentLines}
        studentCode={studentCode}
        studentName={studentName}
      />
    </div>
  );
}

LotteryResultsFromMongo.propTypes = {
  grades: PropTypes.array,
  roster: PropTypes.array,
  medianAdjustment: PropTypes.number,
  rangeOpacity: PropTypes.number,
  showStudentLines: PropTypes.bool,
  studentCode: PropTypes.string,
  studentName: PropTypes.string,
};

export default LotteryResultsFromMongo;
