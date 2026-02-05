import define1 from "./79750b3b8e929d9d@263.js";
import define2 from "./1371b3b2446a73b4@335.js";

function _1(md){return(
md`# Lottery Grades Formatter

Export the grades collection in Mongo as a JSON and load it below`
)}

function _gradesFromNode(courseName){return(
fetch(
  `http://localhost:4001/getAllGrades/${courseName}?t=${performance.now()}`,
  {
    mode: "cors"
  }
).then((res) => res.json())
)}

function _courseName(Inputs){return(
Inputs.select([
  // "webdev_fall_2023", "db_fall_2023",
  "pdp_spring_2024", "db_spring_2024", "lottery_tests"], {
  label: "Current Course",
  value: "pdp_spring_2024"
})
)}

function _grades(dataInput,gradesFromNode){return(
dataInput({initialValue: gradesFromNode})
)}

function _dt(pivotGrades,grades){return(
pivotGrades(grades)
)}

function _pivotGrades(aq,op,d3){return(
function pivotGrades(grades, { prefix = "" } = {}) {
  const gradesByGroup = aq.from(
    grades.map((d) => {
      if (typeof d.timestamp === "string") {
        // when connecting through node, it works like this
        d.createdAt = new Date(d.timestamp);
      } else {
        d.createdAt = new Date(+d.timestamp.$date.$numberLong);
      }
      d.name = d.name.replace("  Confidential", "");
      return d;
    })
  );

  const sumsByStudent = aq
    .from(gradesByGroup)
    .groupby("name")
    .rollup({ sum: op.sum("grade") });
  const sums = new Map(sumsByStudent.objects().map((d) => [d.name, d.sum]));

  const median = d3.median(sums.values());

  // return sums;
  return gradesByGroup
    .derive({
      date: aq.escape((d) => `${prefix}${d.date}`),
      [`${prefix}Accumulated_Points`]: aq.escape((d) => sums.get(d.name)),
      [`${prefix}Class_Median`]: median
    })
    .groupby("name", `${prefix}Accumulated_Points`, `${prefix}Class_Median`)
    .orderby("createdAt")
    .pivot(
      "date",
      { value: (d) => (op.array_agg(d.grade).length ? op.sum(d.grade) : "") },
      { sort: false }
    )
    .orderby("name")
    .view();
}
)}

function _7(aq,grades,op){return(
aq
  .from(
    grades.map((d) => {
      if (typeof d.timestamp === "string") {
        // when connecting through node, it works like this
        d.createdAt = new Date(d.timestamp);
      } else {
        d.createdAt = new Date(+d.timestamp.$date.$numberLong);
      }
      d.name = d.name.replace("  Confidential", "");
      return d;
    })
  )
  .groupby("name")
  .rollup({count: op.count()})
.view()
)}

function _8(dt,aq)
{
  const dates = dt.columnNames().filter((c) => c != "name");



  
  return dt
    .derive({ sum: aq.escape((d) => dates.reduce((p, e) => +p + d[e], 0))   })
    .view();
}


function _9(md){return(
md`You can download the grades as a CSV here`
)}

function _10(dt){return(
dt.objects()
)}

export default function define(runtime, observer) {
  const main = runtime.module();
  main.variable(observer()).define(["md"], _1);
  main.variable(observer("gradesFromNode")).define("gradesFromNode", ["courseName"], _gradesFromNode);
  main.variable(observer("viewof courseName")).define("viewof courseName", ["Inputs"], _courseName);
  main.variable(observer("courseName")).define("courseName", ["Generators", "viewof courseName"], (G, _) => G.input(_));
  main.variable(observer("viewof grades")).define("viewof grades", ["dataInput","gradesFromNode"], _grades);
  main.variable(observer("grades")).define("grades", ["Generators", "viewof grades"], (G, _) => G.input(_));
  main.variable(observer("viewof dt")).define("viewof dt", ["pivotGrades","grades"], _dt);
  main.variable(observer("dt")).define("dt", ["Generators", "viewof dt"], (G, _) => G.input(_));
  main.variable(observer("pivotGrades")).define("pivotGrades", ["aq","op","d3"], _pivotGrades);
  main.variable(observer()).define(["aq","grades","op"], _7);
  main.variable(observer()).define(["dt","aq"], _8);
  main.variable(observer()).define(["md"], _9);
  main.variable(observer()).define(["dt"], _10);
  const child1 = runtime.module(define1);
  main.import("aq", child1);
  main.import("op", child1);
  const child2 = runtime.module(define2);
  main.import("dataInput", child2);
  return main;
}
