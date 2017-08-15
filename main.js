/* global d3 */
var options = [
  "ALFONSO SANCHEZ  CAMILO ALEJANDRO",
  "ARCINIEGAS HURTADO JUAN SEBASTIAN",
  "ARDILA CUADRADO  JOHN EDISSON",
  "BAGES PRADA  JUAN CAMILO",
  "BAQUERO MERCHAN  SAMUEL",
  "BAUTISTA MORA  JAIRO EMILIO",
  "BELLO JIMENEZ  LAURA NATALIA",
  "BOHORQUEZ SANCHEZ  BRANDON ANDRES",
  "CABELLO AGÜERO EDUARDO ARTURO",
  "CALDERON PACHON  HECTOR JOSE",
  "CAMACHO CARO JUAN PABLO",
  "CASTRO VARON JUAN JOSE",
  "CHAPARRO MACHETE JUAN ESTEBAN",
  "CORDOBA BORJA  ALEJANDRO",
  "CUBILLOS SANCHEZ DAVID FERNANDO",
  "DALEL RUEDA  ESTEBAN",
  "DE LA VEGA FERNANDEZ ANTONIO JUAN",
  "DUARTE BERNAL  IVAN DARIO",
  "GOMEZ CELIS  JUAN SEBASTIAN",
  "GONZALEZ ALVAREZ CARLOS EDUARDO",
  "GUZMAN SARMIENTO JUAN DAVID",
  "IREGUI CARREÑO FELIPE",
  "MANTILLA ACOSTA  RAFAEL JOSE",
  "MARIÑO RODRIGEZ  DANIELA",
  "MARTINEZ CASTAÑO SEBASTIAN",
  "PAREDES VALDERRAMA ANDREA JULIANA",
  "PINZON CAPERA  LADY JERALDYNNE",
  "PLAZAS MONTAÑEZ  LUIS FELIPE",
  "POVEDA GOMEZ JULIO ANDRES",
  "ROBAYO GONZALEZ  SANTIAGO",
  "RODRIGUEZ BARRAGAN JUAN MANUEL",
  "RODRIGUEZ RUBIO  DIEGO ANDRES",
  "ROJAS HERRERA  SANTIAGO",
  "SANDOVAL CORDERO ANDRES",
  "SOLANO BELTRAN DIANA CATALINA",
  "TORRES PINZON  JOAN DAVID",
  "TROCONIS GUIA  JAVIER ANTONIO",
  "VELANDIA GONZALEZ  ESNEIDER",
  "VERDUGO QUEVEDO  ANDRES FELIPE",
  "ZUCCHET CARDENAS DIEGO ALEJANDRO"
];

var allOptions = options.map(function (d, i) {
  return {name:d, id:i, drawn:false};
});
var optionsLeft = allOptions.map(function (d) { return d; });
var optionsDrawn = [];


var width = 800,
  height = 800,
  endAngle = 360 - 360/options.length ;

var svg = d3.select("#result")
  .append('svg')
  .attr('width', width)
  .attr('height', height);

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
        ") rotate(" + angleScale(d.id) + ")";
    });

  optionsSel.exit().remove();

}


redraw(allOptions);

function onChoose() {
  var sel = Math.round(Math.random() * optionsLeft.length);
  var optionSel = optionsLeft.splice(sel, 1)[0];
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