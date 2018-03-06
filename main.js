/* global d3 */
var options = d3.shuffle([
"Nicolas Acevedo Sandoval",
"German Camilo Andrade Mayorga",
"Juan Sebastian  Barragan Jeronimo",
"Nicolas Eduardo Cabrera Venegas",
"Camilo Andres Carrillo Niño",
"Santiago  Cortes Fernandez",
"David Fernando  Cubillos Sanchez",
"Bibiana Gamba Sabogal",
"Juan Diego  Gonzalez Arteta",
"David Gustavo Guarin Rojas",
"John Alexis Guerra Gomez",
"Camilo Andres Montenegro Hernandez",
"Cristian Camilo Novoa Avellaneda",
"Sergio Andres Pardo Sanchez",
"Carlos Gabriel  Peñaloza Gomez",
"Juan Sebastian  Prieto Bustamante",
"Paula Juliana Ramirez Gonzalez",
"Juan David  Vega Guzman",
"Freddy Andres Vera Hernandez",
"Camilo  Zambrano Votto"
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
}

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


// var alreadyCalled = [
//   "VERDUGO QUEVEDO ANDRES FELIPE",
//   "MARTINEZ CASTAÑO SEBASTIAN",
//   "MARIÑO RODRIGEZ DANIELA",
//   "RODRIGUEZ BARRAGAN JUAN MANUEL",
//   "CASTRO VARON JUAN JOSE",
//   "ROBAYO GONZALEZ SANTIAGO",
//   "VELANDIA GONZALEZ ESNEIDER",
//   "SANDOVAL CORDERO ANDRES",
//   "TORRES PINZON JOAN DAVID",
//   "CALDERON PACHON HECTOR JOSE",
//   "PINZON CAPERA LADY JERALDYNNE",
//   "BAGES PRADA JUAN CAMILO",
//   "GUZMAN SARMIENTO JUAN DAVID",
//   "GONZALEZ ALVAREZ CARLOS EDUARDO",
//   "PLAZAS MONTAÑEZ LUIS FELIPE",
//   "ARDILA CUADRADO JOHN EDISSON",
//   "PAREDES VALDERRAMA ANDREA JULIANA",
//   "DUARTE BERNAL IVAN DARIO",
//   "ALFONSO SANCHEZ CAMILO ALEJANDRO",
//   "CUBILLOS SANCHEZ DAVID FERNANDO",
//   "BAUTISTA MORA JAIRO EMILIO",
//   "MANTILLA ACOSTA RAFAEL JOSE",
//   "TROCONIS GUIA JAVIER ANTONIO",
//   "DALEL RUEDA ESTEBAN",
//   "CHAPARRO MACHETE JUAN ESTEBAN",
//   "ZUCCHET CARDENAS DIEGO ALEJANDRO",
//   "ROJAS HERRERA SANTIAGO",
//   "BAQUERO MERCHAN SAMUEL",
//   "ARCINIEGAS HURTADO JUAN SEBASTIAN",
//   "SOLANO BELTRAN DIANA CATALINA",
//   "RODRIGUEZ RUBIO DIEGO ANDRES",
//   "CABELLO AGÜERO EDUARDO ARTURO",
//   "BELLO JIMENEZ LAURA NATALIA",
//   "GOMEZ CELIS JUAN SEBASTIAN"
// ];

// function minus(all, minus) {
//   var iAll, iMinus;
//   var res = [];
//   iAll = 0, iMinus;
//   while (iAll<=iAll.length) {
//     if (all[iAll] === minus[iMinus]) {
//       iAll +=1;
//       iMinus +=1;
//       continue;
//     } else (all[iAll] <)



//   }
// }


// alreadyCalled = alreadyCalled.sort();
// options = options.reduce(function (res, val) {

//   if (alreadyCalled.indexOf(val) === -1) {
//     res.push(val);
//   }

//   return res;
// }, []);


// var minus = options.filter(function (d) {
//   return !(alreadyCalled.includes(d));
// });

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
        ") rotate(" + angleScale(d.id) + ")" +
        ", translate(30,0)";
    });

  optionsSel.exit().remove();

}


redraw(allOptions);

function onChoose() {
  var sel = Math.floor(Math.random() * optionsLeft.length);
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