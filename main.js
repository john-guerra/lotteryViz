var options = [
	"ANDRADE BARON, LUISA",
	"AVILA MATALLANA, LAURA C.",
	"BALLESTEROS CUCAITA, MARIA P.",
	"BARRENECHE, DANIELA S.",
	"BOTIA TARAZONA, NICOLAS",
	"CARVAJAL DE LEON, CARLOS A.",
	"HERNANDEZ CARDOSO, DANNA V.",
	"IBARRA LIZCANO, MARCO A.",
	"JORDAN LEAL, JUANPABLO",
	"MARROQUIN DIAZ, ANGIE M.",
	"ORTIZ, LUIS F.",
	"PAEZ JIMENEZ, CARLOS E.",
	"PALENCIA RAMIREZ, DANIELA",
	"RAMIREZ AMARIZ, ANDREA C.",
	"RAMIREZ GAMBOA, JUAN C.",
	"RENGIFO ESPINOSA, JUAN F.",
	"ROJAS PINZON, FELIPE A.",
	"ROMERO SALAZAR, JORGE A.",
	"TORO MARQUEZ, CAROLINA",
	"TORRES ALDANA, ANDRES F.",
	"VELASQUEZ MEJIA, DAVID",
	"VERA FONSECA, MARIA M.",
	"VILLAMIL RUIZ, DIEGO J.",
	"VILLAMIZAR VILLAMIZAR, JESUS D."
];


var width = 800,
	height = 800;

var svg = d3.select("#result")
	.append('svg')
  .attr('width', width)
  .attr('height', height);

var angleScale = d3.scale.linear()
	.domain([0, options.length-2])
	.range([0,350]);


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
		.attr("id", function (d,i) { return "id"+ i; })
		.text(function(d) { return d; })
		.transition().duration(1000)
		.attr("transform", function (d,i ) {
			return "translate(" + width/2 + "," + height/2  +
				") rotate(" + angleScale(i) + ")";
		});

	optionsSel.exit().remove();

}


redraw(options);

function onChoose() {
	var sel = Math.round(Math.random() * options.length);
	var selAngle = angleScale(sel);
	angleScale.range([selAngle, selAngle+350]);
	console.log("#id"+sel);
	d3.selectAll(".option").style("font-size", "15pt");
	d3.select("#id" +sel).transition().duration(500)
		.style("font-size", "50pt")
		.style("fill", "red");
	redraw(options);
	// d3.select("#result").text("Seleccionado = " + options[sel]);
}