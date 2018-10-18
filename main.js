/* global d3 */
var options = d3.shuffle([
  "ALVARADO CERON, PABLO ALEJANDRO",
  "ANGEL VILLADIEGO, RICARDO ANDRES",
  "ANZOLA GONZALEZ, CAMILO ANDRES",
  "CABEZAS VARELA, ANGEL CAMILO",
  "CAGUA ENNIS, DANIEL",
  "CARDENAS GASCA, RAFAEL",
  "CARDENAS LANDAZABAL, SERGIO EDUARDO",
  "CASTANEDA HIDALGO, ZULMA LORENA",
  "DIAZ SERRANO, JUAN SEBASTIAN",
  "GALVIS GUTIERREZ, ESTEBAN",
  "GARCIA FLORES, ALEJANDRO",
  "GOMEZ CUBILLOS, VIVIAN NATALIA",
  "GONZALEZ MELO, JHON JAIRO",
  "GONZALEZ PEÑA, JUAN PABLO",
  "GONZALEZ PEÑUELA, RICARDO ENRIQUE",
  "GUARIN ROJAS, DAVID GUSTAVO",
  "HERNANDEZ MOYA, MARIA CAMILA",
  "JIMENEZ GACHA, STEPHANNIE",
  "LOPEZ FABARA, ANDRES FELIPE",
  "MANRIQUE PUERTO, JULIAN ALBERTO",
  "MILLAN LEJARDE, JUAN SEBASTIAN",
  "MORENO MARIN, ANDRES FELIPE",
  "MUNERA DAVILA, SANTIAGO FELIPE",
  "NEIRA GIRALDO, MAURICIO",
  "PINTO PINEDA, GABRIEL LEONARDO",
  "RAMIREZ VANEGAS, DAVID ANDRES",
  "RAMOS GOMEZ, JUAN SEBASTIAN",
  "SABOGAL ROJAS, ORLANDO",
  "SIMMONDS SAMPER, NICOLAS",
  "USECHE RODRIGUEZ, JUAN CAMILO",
  "VANEGAS GARCIA, LAURA VALERIA",
  "VEGA GUZMAN, JUAN DAVID"
]);

// https://cmatskas.com/get-url-parameters-using-javascript/
var parseQueryString = function(url) {
  var urlParams = {};
  url.replace(
    new RegExp("([^?=&]+)(=([^&]*))?", "g"),
    function($0, $1, $2, $3) {
      urlParams[$1] = $3;
    }
  );

  return urlParams;
};

var params = parseQueryString(location.search);
if (params && params.section==="2") {
  options = [
    "AGUILAR LEON  NICOLAS",
    "ALVARADO CERON  PABLO ALEJANDRO",
    "BUSTAMANTE ATEHORTUA  JUAN CAMILO",
    "CHAVES SANGUINO JUAN DIEGO",
    "DOMINGUEZ OSORIO  JUAN MANUEL",
    "ECHEVERRI ROMERO  ALEJANDRO",
    "GARCIA ESCALLON ROGELIO",
    "LAITON VARGAS ANDRES DAVID",
    "LOPEZ CORREDOR  FABIO ANDRES",
    "LOVERA LOZANO JUAN MANUEL ALBERTO",
    "MENDEZ PERALTA  JUAN FELIPE",
    "OLIVARES VARGAS ANDRES FELIPE",
    "PINILLA RAMIREZ JUAN CAMILO",
    "RAVELO MENDEZ WILLIAM RICARDO",
    "VEGA SALAZAR  RAMON ESTEBAN",
    "VELANDIA GONZALEZ ESNEIDER",
    "VENEGAS BERNAL  TOMAS FELIPE"
  ];

}



var allOptions = options.map(function (d, i) {
  return {name:d, id:i, drawn:false};
});
var optionsLeft = allOptions.map(function (d) { return d; });
var optionsDrawn = [];


var width = 800,
  height = 800,
  endAngle = 360 - 360/options.length ;

var svg = d3.select("#result")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

var angleScale = d3.scale.linear()
  .domain([0, options.length-1])
  .range([0,endAngle]);


d3.select("#btnChoose")
  .on("click", onChoose);



function redraw(options) {
  var optionsSel = svg.selectAll(".option")
    .data(options);

  optionsSel.enter()
    .append("text")
    .attr("class", "option");

  optionsSel
    // .attr("x", width/2)
    // .attr("y", height/2)
    .attr("id", function (d) { return "id"+ d.id; })
    .classed("drawn", function(d) { return d.drawn; })
    .text(function(d) { return d.name; })
    .transition().duration(1000)
    .attr("transform", function (d) {
      return "translate(" + width/2 + "," + height/2  +
        ") rotate(" + angleScale(d.id) + ")" +
        ", translate(30,0)";
    });

  optionsSel.exit().remove();

}


redraw(allOptions);

function onChoose() {
  var sel = Math.floor(Math.random() * optionsLeft.length);
  var optionSel = optionsLeft.splice(sel, 1)[0];

  if(optionSel === undefined) {
    console.log("No more options left");
    alert("No more options left");  // Optional
  }

  optionSel.drawn = true;
  optionsDrawn = [optionSel].concat(optionsDrawn);
  angleScale
    .range([0, endAngle]);
  var selAngle = angleScale(optionSel.id);

  console.log("sel="+ sel +" angle="+selAngle + " option " + optionSel.name);

  angleScale.range([-selAngle, endAngle-selAngle]);
  console.log("#id "+sel);
  d3.selectAll(".option")
    .classed("selected", false);
  redraw(allOptions);
  console.log("#id" + optionSel.id);
  d3.select("#id" + optionSel.id)
    .classed("selected", true);

  var drawn = d3.select("#drawn").selectAll(".drawn")
    .data(optionsDrawn);

  drawn.enter()
    .append("p");
  drawn
    .attr("class", "drawn")
    .text(function (d) { return d.name; });
  drawn.exit().remove();

  // d3.select("#result").text("Seleccionado = " + options[sel]);
}
