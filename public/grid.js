
// gridData
// create a new grid with colors from the server
// void -> d3 data object
function gridData() {
	var rawData;
	var data = new Array();
	var xpos = 1; //starting xpos and ypos at 1 so the stroke will show when we make the grid below
	var ypos = 1;
	var width = 50;
	var height = 50;
	var click = 0;

	// make get request for colors
	var url = "http://ln.raceplace.org/colors";
	//var url = "test.json";
	d3.json(url, function(error, response) {
    	//console.log(response);
    	rawData = response.colors;

    	console.log(rawData);

		// iterate for rows	
		for (var row = 0; row < 16; row++) {
			data.push( new Array() );
			
			// iterate for cells/columns inside rows
			for (var column = 0; column < 16; column++) {
				data[row].push({
					x: xpos,
					y: ypos,
					width: width,
					height: height,
					click: click,
					color: rawData[row*16+column]
				})
				// increment the x position. I.e. move it over by 50 (width variable)
				xpos += width;
			}
			// reset the x position after a row is complete
			xpos = 1;
			// increment the y position for the next row. Move it down 50 (height variable)
			ypos += height;	

		}
		setGrid(data);
	});
}

function setGrid(gridData) {
	// I like to log the data to the console for quick debugging
	console.log(gridData);

	var copi = cp.colorpicker();
	d3.select('.colorPicker svg')
	  	.datum(cp.colorSystems.hsla)
	  	.call(copi)

	copi.dispatch.on('cpupdate', function(d) {
	  	var currentColor = cp.converters.dataToHslaString(d);
	  	var square = grid.selectAll(".square").filter(function(d){
	  		return selected.x && selected.y && selected.x == d.x && selected.y == d.y;
	  	});
	  	square.style('fill',currentColor);
	});

	var grid = d3.select("#grid")
		.append("svg")
		.attr("width","810px")
		.attr("height","810px");
		
	var row = grid.selectAll(".row")
		.data(gridData)
		.enter().append("g")
		.attr("class", "row");

	var column = row.selectAll(".square")
		.data(function(d) { return d; })
		.enter().append("rect")
		.attr("class", "square")
		.attr("x", function(d) { return d.x; })
		.attr("y", function(d) { return d.y; })
		.attr("width", function(d) { return d.width; })
		.attr("height", function(d) { return d.height; })
		.style("fill", function(d) { return d.color})
		.style("stroke", "#222")
		.on('click', function(d, col, row) {
	       d.click = !d.click
	       console.log(arguments)

	       	selected.x = d.x;
       		selected.y = d.y;
       		d3.select("#row").text(row);
       		d3.select("#col").text(col);
	    });

	grid.on('blur',function(){

		var square = grid.selectAll(".square").filter(function(d){
	  		return selected.x && selected.y && selected.x == d.x && selected.y == d.y;
	  	});
	  	square.style('fill',function(d){
	  		return d.color;
	  	});

		selected = {};
		d3.select("#row").text('--');
	    d3.select("#col").text('--');
	});

}

gridData();

var selected = {};