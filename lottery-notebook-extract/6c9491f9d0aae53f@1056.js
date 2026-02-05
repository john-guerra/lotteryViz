function _1(md,adjustment){return(
md`# Lottery Results

You want to be in the blue area, check for how many points you have on canvas and then find where you stand.

__Notice that I'm computing the grade based on the class median - ${adjustment} points__

You can also try to find yourself entering a student id between S0 to S9`
)}

function _code(Inputs){return(
Inputs.text({
  label: "Anonymous Student ID",
  value:""
})
)}

function _3(Inputs,getAssignmentInput,$0,md){return(
md`## Class performance for ${Inputs.bind( getAssignmentInput(false), $0,)}`
)}

function _chart(html,width,height,d3,riskRangeColor,margin,drawReference,drawAxis,drawSelectedStudent,drawTicks)
{
  const target = html`<div><style>svg {
    font-size: 9pt;
    font-family: "Trebuchet MS", Verdana, sans-serif;
  }</style>
  <svg width=${width} height=${height}>
    <defs>
    <linearGradient id="riskGradient" gradientTransform="rotate(90)">
      ${d3
        .range(0, 10)
        .map(
          (s) =>
            `<stop stop-color="${riskRangeColor(s * 10)}" offset="${
              s * 10
            }%" />`
        )}
    </linearGradient>
    </defs>
  </svg>
  </div>`;
  const svg = d3.select(target).select("svg").style("overflow", "visible");

  const gDrawing = svg
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  drawReference(gDrawing);
  drawAxis(gDrawing);

  const gData = gDrawing.append("g").attr("class", "data");

  drawSelectedStudent(gData);
  drawTicks(gData);

  return target;
}


function _adjustment(assignment){return(
assignment === "Lottery" ? 0: 0
)}

function _curve(Inputs,d3){return(
Inputs.select(
  [
    { n: "bumpX", fn: d3.curveBumpX },
    { n: "basis", fn: d3.curveBasis },
    { n: "monotoneX", fn: d3.curveMonotoneX },    
    { n: "step", fn: d3.curveStep },
    { n: "stepBefore", fn: d3.curveStepBefore },
    { n: "linear", fn: d3.curveLinear },
  ],
  { label: "Curve Interpolation", format: (d) => d.n }
)
)}

function _showStudentLines(Inputs){return(
Inputs.toggle({label: "Show student lines"})
)}

function _rangeOpacity(Inputs){return(
Inputs.range([0, 1], {label: "Background Opacity", step: .1, value: .6})
)}

function _assignment(getAssignmentInput){return(
getAssignmentInput()
)}

function _drawSelectedStudent(code,accumPoints,iwidth,x,y,boxColor){return(
function drawSelectedStudent(gData) {
  if (code) {
    const selectedGrades = accumPoints.filter((d) => d.ID === code);
    if (selectedGrades.length === 0) {
      gData
        .append("text")
        .attr("x", iwidth / 2)
        .attr("y", 0)
        .style("font-size", "24pt")
        .style("fill", "firebrick")
        .text("Code not found");
    } else {
      gData
        .selectAll("rect.boxes")
        .data(selectedGrades)
        .join("g")
        .attr("class", "boxes")
        .attr(
          "transform",
          (d) =>
            `translate(
                ${x(d.date) + x.bandwidth() / 2}, 
                ${y(+d.accum)}
              )`
        )
        // .call( box => {
        //   box
        //     .append("rect")
        //     // .attr("y", d => d.accum-d.points ? y(Math.abs(+d.points)) : y(0))
        //     // .attr("x", d => x(d.date))
        //     .attr("width", x.bandwidth())
        //     .attr("height", d => y(Math.abs(+d.points)) )
        //     .style("fill", d => boxColor(d.points));
        // })
        .call((box) => {
          box
            .append("circle")
            // .attr("y", d => d.accum-d.points ? y(Math.abs(+d.points)) : y(0))
            // .attr("cx", d => x.bandwidth()/2)
            .attr("r", 10)
            .style("stroke", "white")
            .style("fill", (d) => boxColor(d.points || 0));
        })

        .call((box) => {
          box
            .append("text")
            .attr("dx", 12)
            .attr("dy", 5)
            .style("font-size", "8pt")
            .text((d) => `${d.accum}`);
        });
    }
  }
}
)}

function _drawAxis(d3,y,iwidth,x,iheight){return(
function drawAxis(gDrawing) {
  gDrawing
    .append("g")
    .call(d3.axisLeft(y).ticks(5).tickSize(-iwidth))
    .attr("font-size", "14pt")
    .call((gAxis) => {
      gAxis.selectAll(".domain").remove();
      gAxis
        .selectAll(".tick > line")
        .style("stroke", "#777")
        .style("stroke-dasharray", "1 5");
    })
    .append("text")
    .text("Accumulated points")
    .attr("fill", "black")
    .attr("dy", -10)
    .attr("transform", "rotate(90)")
    .attr("font-size", "10pt")
    .style("text-anchor", "start");
  gDrawing
    .append("g")
    .call(d3.axisBottom(x))
    .attr("transform", `translate(0, ${iheight})`)
    .call((xAxis) =>
      xAxis
        .selectAll(".tick > text")
        .attr("text-anchor", "end")
        .attr("transform", `rotate(-30)`)
    )
    .append("text")
    .text("Date")
    .attr("fill", "black")
    .attr("x", iwidth)
    .attr("dy", -10)
    .attr("font-size", "10pt")
    .style("text-anchor", "end");
}
)}

function _12(decilesByDate){return(
decilesByDate
)}

function _getDecilesRange(decilesByDate,decilesNumbers){return(
function getDecilesRange(i) {
  return decilesByDate.map(([date, deciles]) => ({
    date,
    y0: deciles[decilesNumbers[i ]],
    y1: deciles[decilesNumbers[i +1]]
  }));
}
)}

function _14(getDecilesRange){return(
getDecilesRange(0)
)}

function _15(decilesNumbers){return(
decilesNumbers
)}

function _drawReference(decilesNumbers,referenceArea,getDecilesRange,riskRangeColor,rangeOpacity,decilesByDate,referenceLine,nestedAccumPoints,d3,adjustment,x,y){return(
function drawReference(gData) {
  // // Reference as rectangles
  // gData
  //   .selectAll("g.deciles")
  //   .data(decilesByDate)
  //   .join("g")
  //   .attr("class", "decile")
  //   .each(function ([date, deciles]) {
  //     debugger;
  //     d3.select(this)
  //       .selectAll("rect.decile")
  //       .data(decilesNumbers)
  //       .join("rect")
  //       .attr("class", "decile")
  //       .attr("y", (d, i) =>
  //         d === decilesNumbers.at(-1)
  //           ? y.range()[1]
  //           : y(deciles[decilesNumbers[i + 1]])
  //       )
  //       .attr("x", (d) => x(date))
  //       .attr("width", x.bandwidth())
  //       .attr("height", (d, i) =>
  //         d === 0
  //           ? y.range()[0]
  //           : y(deciles[decilesNumbers[i]]) -
  //             // if we are at the last decile, take it to the top
  //             (d === decilesNumbers.at(-1)
  //               ? y.range()[1]
  //               : y(deciles[decilesNumbers[i + 1]]))
  //       )
  //       .attr("fill", (d) => riskRangeColor(d));
  //     // .attr("opacity", 0.2);
  //   });

  // Reference as curves
  gData
    .selectAll("path.deciles")
    .data(decilesNumbers)
    .join("path")
    .attr("class", "decile")
    .attr("d", (d, i) => referenceArea(getDecilesRange(i)))
    .attr("fill", (d) => riskRangeColor(d))
    .attr("opacity", rangeOpacity)
    .append("title")
    .text((d) => `Percentile ${d}`);

  gData
    .selectAll("path.referenceLine")
    .data([decilesByDate])
    .join("path")
    .attr("class", "referenceLine")
    .attr("d", referenceLine)
    .style("stroke", "#aaa")
    .style("fill", "none")
    .style("stroke-width", "3px");

  const lastVal = Array.from(nestedAccumPoints).at(-1);
  const classAvg = d3.median(lastVal[1], (row) => row.accum) - adjustment;
  const fmt = d3.format("0.2");

  gData
    .append("text")
    .text(`Class median ${adjustment>0 ? "-" + adjustment : ""}: ${fmt(classAvg)}`)
    .style("text-anchor", "start")
    .style("fill", "#777")
    .attr("x", x(lastVal[0]) + x.bandwidth() / 2)
    .attr("y", y(classAvg) - 3);
}
)}

function _drawTicks(nestedAccumPoints,y,x,showStudentLines,nestedAccumPointsByID,studentLine){return(
function drawTicks(gData) {
  gData
    .selectAll(".date")
    .data(nestedAccumPoints)
    .join("g")
    .attr("class", "date")
    .call((g) =>
      g
        .selectAll("line.tick")
        .data((row) => row[1])
        .join("line")
        .attr("y1", (d) => {
          d.jitter = Math.random() * 10 - 5;
          d.jitterY = Math.random() * 10 - 5;
          return y(d.accum) + d.jitter;
        })
        .attr("y2", (d) => y(d.accum) + d.jitter)
        .attr("x1", (d) => x(d.date) - 5)
        .attr("x2", (d) => x(d.date) + 5)
        .style("stroke", "#999")
        .style("opacity", 0.6)
    );

  if (showStudentLines) {
    // Draw all the students as lines
    gData
      .selectAll(".studentLines")
      .data(nestedAccumPointsByID)
      .join("path")
      .attr("class", "studentLines")
      .attr("d", ([id, values]) => {
        return studentLine(values);
      })
      .attr("fill", "none")
      .attr("stroke", "#777")
      .attr("opacity", 0.6);
  }
}
)}

function _getAssignmentInput(Inputs){return(
function getAssignmentInput(label = true) {
  const ele = Inputs.select(["Lottery", "Tweets"], {
    label: label ? "Assignment" : null
  });

  if (!label) {
    ele.style.display = "inline-block";
    ele.style.width = "80px";
  }

  return ele;
}
)}

function _margin(){return(
{top: 20, right: 100, bottom: 70, left: 60}
)}

function _iwidth(width,margin){return(
width - margin.left - margin.right
)}

function _iheight(height,margin){return(
height - margin.top - margin.bottom
)}

function _width(){return(
600
)}

function _height(){return(
400
)}

function _boxColor(d3){return(
d3.scaleSequential(d3.interpolatePiYG)
  .domain([-6, 6])
)}

function _riskRangeColor(d3){return(
d3.scaleSequential(d3.interpolateRdBu).domain([-20, 120])
)}

function _26(y){return(
y.domain()
)}

function _27(adjustment){return(
adjustment
)}

function _y(d3,adjustment,accumPoints,iheight){return(
d3
  .scaleLinear()
  .domain([-adjustment, d3.max(accumPoints, (d) => d.accum)])
  .nice()
  .range([iheight, 0])
)}

function _x(d3,dates,iwidth){return(
d3.scalePoint()
  .domain(dates)
  .range([0, iwidth])
)}

function _referenceLine(d3,y,x,curve){return(
d3
  .line()
  .y(([date, d]) => y(d.median))
  .x(([date, d], i) => x(date) + x.bandwidth() / 2)
  .curve(curve.fn)
)}

function _referenceArea(d3,y,x,curve){return(
d3
  .area()
  .y0((d) => y(d.y0))
  .y1((d) => y(d.y1))
  .x((d) => x(d.date) + x.bandwidth()/2)
  .curve(curve.fn)
)}

function _studentLine(d3,y,x,curve){return(
d3
  .line()
  // .y0(([k, values]) => y(d3.median(values, (row) => row.accum)))
  .y(d => y(d.accum))
  .x(d => x(d.date) + x.bandwidth()/2)
  .curve(curve.fn)
)}

function _nestedAccumPoints(d3,accumPoints){return(
d3.group(accumPoints, d => d.date)
)}

function _decilesNumbers(d3,n){return(
d3.range(0, 100 + 100/n, 100/n )
)}

function _n(){return(
50
)}

function _decilesByDate(d3,accumPoints,decilesNumbers,adjustment){return(
d3
  .groups(accumPoints, (d) => d.date)
  .map(([date, values]) => [
    date,
    Object.fromEntries(
      decilesNumbers
        .map((q) => [q, d3.quantile(values, q / 100, (d) => d.accum) - adjustment])
        .concat([["median", d3.median(values, (d) => d.accum)- adjustment]])
    )
  ])
)}

function _nestedAccumPointsByID(d3,accumPoints){return(
d3.group(accumPoints, d => d.ID)
)}

function _accumPoints(d3,data,dates)
{
  const accum = {};
  const fmt = (d) => new Date(d3.timeParse("%a %b %d %Y")(d))

  return data.reduce((p, row) => {
    accum[row.ID] = 0;

    return p.concat(
      dates.reduce((dp, date) => {
        const ret = {
          ID: row.ID,
          date: date,
          parsedDate: fmt(date),
          accum: accum[row.ID] += +row[date],
          points: row[date]
        };
        return dp.concat(ret);
      }, [])
    );
  }, []);
  // .filter(d => d.parsedDate < new Date());
}


function _dates(data){return(
Object.keys(data[0]).slice(2)
)}

async function _lottery(FileAttachment){return(
(
  await FileAttachment("lottery_for_visualization@1.csv").csv({ typed: true })
)
  .map((d, i) => ({ ID: `S${i}`, ...d }))
)}

async function _tweets(FileAttachment){return(
(
  await FileAttachment("tweets_for_visualization.csv").csv({ typed: true })
).map((d, i) => ({ ID: `S${i}`, ...d }))
)}

function _data(assignment,lottery,tweets){return(
assignment === "Lottery" ? lottery : tweets
)}

function _d3(require){return(
require("d3@7")
)}

export default function define(runtime, observer) {
  const main = runtime.module();
  function toString() { return this.url; }
  const fileAttachments = new Map([
    ["lottery_for_visualization@1.csv", {url: new URL("./files/a69f011517906fda9dc58a1eb3382aaed5915169f91347230dac367890e38526ef596c42c685e98b2e230e7044c18eeda731786993ad31a0f34dc6eb6ec8659c.csv", import.meta.url), mimeType: "text/csv", toString}],
    ["tweets_for_visualization.csv", {url: new URL("./files/54ad9d87d812a5c305b708584b736dcbad8ba3ded6f0af7f5eb50e9b96e459a15aff248c3b9ce2a371e9488ca89c60b74eeea6a13b25ad4a22a53c3fb570ff40.csv", import.meta.url), mimeType: "text/csv", toString}]
  ]);
  main.builtin("FileAttachment", runtime.fileAttachments(name => fileAttachments.get(name)));
  main.variable(observer()).define(["md","adjustment"], _1);
  main.variable(observer("viewof code")).define("viewof code", ["Inputs"], _code);
  main.variable(observer("code")).define("code", ["Generators", "viewof code"], (G, _) => G.input(_));
  main.variable(observer()).define(["Inputs","getAssignmentInput","viewof assignment","md"], _3);
  main.variable(observer("chart")).define("chart", ["html","width","height","d3","riskRangeColor","margin","drawReference","drawAxis","drawSelectedStudent","drawTicks"], _chart);
  main.variable(observer("adjustment")).define("adjustment", ["assignment"], _adjustment);
  main.variable(observer("viewof curve")).define("viewof curve", ["Inputs","d3"], _curve);
  main.variable(observer("curve")).define("curve", ["Generators", "viewof curve"], (G, _) => G.input(_));
  main.variable(observer("viewof showStudentLines")).define("viewof showStudentLines", ["Inputs"], _showStudentLines);
  main.variable(observer("showStudentLines")).define("showStudentLines", ["Generators", "viewof showStudentLines"], (G, _) => G.input(_));
  main.variable(observer("viewof rangeOpacity")).define("viewof rangeOpacity", ["Inputs"], _rangeOpacity);
  main.variable(observer("rangeOpacity")).define("rangeOpacity", ["Generators", "viewof rangeOpacity"], (G, _) => G.input(_));
  main.variable(observer("viewof assignment")).define("viewof assignment", ["getAssignmentInput"], _assignment);
  main.variable(observer("assignment")).define("assignment", ["Generators", "viewof assignment"], (G, _) => G.input(_));
  main.variable(observer("drawSelectedStudent")).define("drawSelectedStudent", ["code","accumPoints","iwidth","x","y","boxColor"], _drawSelectedStudent);
  main.variable(observer("drawAxis")).define("drawAxis", ["d3","y","iwidth","x","iheight"], _drawAxis);
  main.variable(observer()).define(["decilesByDate"], _12);
  main.variable(observer("getDecilesRange")).define("getDecilesRange", ["decilesByDate","decilesNumbers"], _getDecilesRange);
  main.variable(observer()).define(["getDecilesRange"], _14);
  main.variable(observer()).define(["decilesNumbers"], _15);
  main.variable(observer("drawReference")).define("drawReference", ["decilesNumbers","referenceArea","getDecilesRange","riskRangeColor","rangeOpacity","decilesByDate","referenceLine","nestedAccumPoints","d3","adjustment","x","y"], _drawReference);
  main.variable(observer("drawTicks")).define("drawTicks", ["nestedAccumPoints","y","x","showStudentLines","nestedAccumPointsByID","studentLine"], _drawTicks);
  main.variable(observer("getAssignmentInput")).define("getAssignmentInput", ["Inputs"], _getAssignmentInput);
  main.variable(observer("margin")).define("margin", _margin);
  main.variable(observer("iwidth")).define("iwidth", ["width","margin"], _iwidth);
  main.variable(observer("iheight")).define("iheight", ["height","margin"], _iheight);
  main.variable(observer("width")).define("width", _width);
  main.variable(observer("height")).define("height", _height);
  main.variable(observer("boxColor")).define("boxColor", ["d3"], _boxColor);
  main.variable(observer("riskRangeColor")).define("riskRangeColor", ["d3"], _riskRangeColor);
  main.variable(observer()).define(["y"], _26);
  main.variable(observer()).define(["adjustment"], _27);
  main.variable(observer("y")).define("y", ["d3","adjustment","accumPoints","iheight"], _y);
  main.variable(observer("x")).define("x", ["d3","dates","iwidth"], _x);
  main.variable(observer("referenceLine")).define("referenceLine", ["d3","y","x","curve"], _referenceLine);
  main.variable(observer("referenceArea")).define("referenceArea", ["d3","y","x","curve"], _referenceArea);
  main.variable(observer("studentLine")).define("studentLine", ["d3","y","x","curve"], _studentLine);
  main.variable(observer("nestedAccumPoints")).define("nestedAccumPoints", ["d3","accumPoints"], _nestedAccumPoints);
  main.variable(observer("decilesNumbers")).define("decilesNumbers", ["d3","n"], _decilesNumbers);
  main.variable(observer("n")).define("n", _n);
  main.variable(observer("decilesByDate")).define("decilesByDate", ["d3","accumPoints","decilesNumbers","adjustment"], _decilesByDate);
  main.variable(observer("nestedAccumPointsByID")).define("nestedAccumPointsByID", ["d3","accumPoints"], _nestedAccumPointsByID);
  main.variable(observer("accumPoints")).define("accumPoints", ["d3","data","dates"], _accumPoints);
  main.variable(observer("dates")).define("dates", ["data"], _dates);
  main.variable(observer("lottery")).define("lottery", ["FileAttachment"], _lottery);
  main.variable(observer("tweets")).define("tweets", ["FileAttachment"], _tweets);
  main.variable(observer("data")).define("data", ["assignment","lottery","tweets"], _data);
  main.variable(observer("d3")).define("d3", ["require"], _d3);
  return main;
}
