import define1 from "./6c9491f9d0aae53f@1056.js";
import define2 from "./2e087334e10cf1c1@212.js";

function _1(md){return(
md`# Lottery Results from Mongo`
)}

function _lotteryMongo(courseName){return(
fetch(`http://localhost:4001/getAllGrades/${courseName}?t=${performance.now()}`, {
  mode: "cors"
}).then((res) => res.json())
)}

function _courseName(Inputs,defaultCourse){return(
Inputs.select(
  [
    "db_spring_2026",
    "webdev_spring_2026",
    "aicoding_spring_2026",
    "webdev_fall_2025",
    "webdev_online_fall_2025",
    "sweng_fall_2025",
    
    "lottery_tests"
  ],
  {
    label: "Current Course",
    value: defaultCourse
  }
)
)}

function _defaultCourse(){return(
"db_spring_2026"
)}

function _lotteryDF(pivotGrades,lotteryMongo){return(
pivotGrades(lotteryMongo, {prefix: "Lottery_"})
)}

function _dates(lottery){return(
Object.keys(lottery[0]).slice(4)
)}

function _lottery(lotteryDF){return(
lotteryDF.objects()
)}

function _adjustment(Inputs){return(
Inputs.range([0, 10], {label: "Adjustment", value: 0, step: 1})
)}

function _lotteryChart(chart){return(
chart
)}

function _width(){return(
600
)}

function _11(Inputs,lottery){return(
Inputs.table(lottery)
)}

export default function define(runtime, observer) {
  const main = runtime.module();
  main.variable(observer()).define(["md"], _1);
  main.variable(observer("lotteryMongo")).define("lotteryMongo", ["courseName"], _lotteryMongo);
  main.variable(observer("viewof courseName")).define("viewof courseName", ["Inputs","defaultCourse"], _courseName);
  main.variable(observer("courseName")).define("courseName", ["Generators", "viewof courseName"], (G, _) => G.input(_));
  main.variable(observer("defaultCourse")).define("defaultCourse", _defaultCourse);
  main.variable(observer("viewof lotteryDF")).define("viewof lotteryDF", ["pivotGrades","lotteryMongo"], _lotteryDF);
  main.variable(observer("lotteryDF")).define("lotteryDF", ["Generators", "viewof lotteryDF"], (G, _) => G.input(_));
  main.variable(observer("dates")).define("dates", ["lottery"], _dates);
  main.variable(observer("lottery")).define("lottery", ["lotteryDF"], _lottery);
  main.variable(observer("viewof adjustment")).define("viewof adjustment", ["Inputs"], _adjustment);
  main.variable(observer("adjustment")).define("adjustment", ["Generators", "viewof adjustment"], (G, _) => G.input(_));
  main.variable(observer("lotteryChart")).define("lotteryChart", ["chart"], _lotteryChart);
  main.variable(observer("width")).define("width", _width);
  main.variable(observer()).define(["Inputs","lottery"], _11);
  const child1 = runtime.module(define1).derive(["lottery","width","adjustment","dates"], main);
  main.import("chart", child1);
  const child2 = runtime.module(define2);
  main.import("pivotGrades", child2);
  return main;
}
