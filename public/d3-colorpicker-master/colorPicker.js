var cp = window.cp || {};
window.cp = cp;

cp.colorpicker = function() {

    var dispatch = d3.dispatch('cpupdate')

    var boxSize = 145,
        barWidth = 450,
        barHeight = 25;

    function colorPicker(selection) {
      selection.each(function(data) {

        var barScales = data.map(function(d,i) {
          return d3.scale.linear().domain([0,barWidth]).range(d.range);
        })

        var sliderScales = data.map(function(d,i) {
          return d3.scale.linear().domain(d.range).range([-7,barWidth-7]).clamp(true);
        })

        var wrap = d3.select(this).selectAll('g').data([data]);
        var wrapEnter = wrap.enter().append('g').attr('class','wrap').attr('transform','translate(10,10)');

        /*************************
        /  Current color box
        /************************/

        var colorBoxWrap = wrapEnter.append('g').attr('class','colorBox-wrap')

        var cbTransparencyLines = colorBoxWrap.selectAll('line').data(d3.range(7.5,boxSize,10))
        cbTransparencyLines.enter().append('line').attr('class','tLineX tLine')
        cbTransparencyLines.enter().append('line').attr('class','tLineY tLine')

          wrap.selectAll('.tLineX')
            .attr('x1', function(d) { return d })
            .attr('x2', function(d) { return d })
            .attr('y1', 0)
            .attr('y2', boxSize)

          wrap.selectAll('.tLineY')
            .attr('y1', function(d) { return d })
            .attr('y2', function(d) { return d })
            .attr('x1', 0)
            .attr('x2', boxSize)

        var colorBox = colorBoxWrap.append('rect').attr('class','colorBox')

        colorBox
            .attr('height',boxSize)
            .attr('width',boxSize)
            .style('fill', 'hsla(' + data.map(function(d,i) { return d.value + d.postfix; }).join(',') + ')')
            .attr('rx',6)
            .attr('ry',6)

        /*************************
        /  Color bar wrapper and colors
        /************************/

        var colorBarWrap = wrapEnter.append('g').attr('class','colorBar-wrap')
            .attr('transform',function(d,i) { return 'translate(' + boxSize + ',0)'; })

        var colorBar = colorBarWrap.selectAll('g.colorBar').data(function(d) { return d; });
        var colorBarEnter = colorBar.enter().append('g').attr('class','colorBar');

        colorBarEnter
            .attr('transform',function(d,i) { return 'translate(50,' + (i * 40) + ')'; })
            ;

        colorBarEnter.append('rect')
            .style('fill','hsla(0,0%,0%,0)')
            .attr('height',barHeight)
            .attr('width',barWidth)
            ;

        var colorBarTitle = colorBarEnter.append('text').attr('class','colorBarTitle');

        colorBarTitle
            .attr('dx',-25)
            .attr('dy',17.5)
            .style('text-anchor','middle')
            .text(function(d) { return d.key;})

        var colorBarValue = colorBarEnter.append('text').attr('class','colorBarValue');

        colorBarValue
            .attr('dx',barWidth + 25)
            .attr('dy',17.5)
            .style('text-anchor','start')

        var barTransparencyLinesX = colorBar.selectAll('line.barTLineX').data(d3.range(5,barWidth,10))
        var barTransparencyLinesEnterX = barTransparencyLinesX.enter().append('line').attr('class','barTLineX tLine')
        var barTransparencyLinesY = colorBar.selectAll('line.barTLineY').data(d3.range(7.5,barHeight,10))
        var barTransparencyLinesEnterY = barTransparencyLinesY.enter().append('line').attr('class','barTLineY tLine')

        barTransparencyLinesX
            .attr('x1', function(d) { return d; })
            .attr('x2', function(d) { return d; })
            .attr('y1', 0)
            .attr('y2', barHeight)

        barTransparencyLinesY
            .attr('x1', 0)
            .attr('x2', barWidth)
            .attr('y1', function(d) { return d; })
            .attr('y2', function(d) { return d; })

        var barGradient = colorBar.selectAll('line.barGradientLine').data(function(d) { return d3.range(-1,barWidth,2)});
        var barGradientEnter = barGradient.enter().append('line').attr('class','barGradientLine')

        barGradientEnter
            .style('stroke-width',3)
            .attr('y1', 0)
            .attr('y2', 25)
            .attr('x1',function(d,i) { return d })
            .attr('x2',function(d,i) { return d });

        update();

        /*************************
        /  Slider Rects
        /************************/

        colorBarEnter.append('rect')
                      .attr('class','slider')
                      .attr('width',14)
                      .attr('height',37)
                      .attr('y', -6)
                      .attr('x', function(d,i) { return sliderScales[i](d.value) })

        var sliders = colorBar.select('.slider')

        var sliderDrag = d3.behavior.drag();

        sliderDrag
          .origin(function(d,i) { return {x:d3.select(this).attr('x'),y:d3.select(this).attr('y')};})
          .on('dragstart', function(d,i) { d3.select(this).classed('dragging',true) })
          .on('drag', function(d,i) {
            var slider = d3.select(this);
            var invertX = sliderScales[i].invert(d3.event.x);
            slider.attr('x',sliderScales[i](invertX));

            data[i].value = invertX;

            update();

            colorBox  
              .style('fill', 'hsla(' + data.map(function(d,i) { return d.value + d.postfix; }).join(',') + ')')
          })
          .on('dragend', function(d,i) {
            d3.select(this).classed('dragging', false)
          })

        sliderDrag.call(sliders);

        /*************************
        /  Repeated Functions
        /************************/

        function update() {
            barGradient
                .style('stroke',function(d,i,j) { 
                    var hsla = ['0','100%','50%','1'];
                    hsla = hsla.map(function(f,k) {
                      var currentScale = barScales[k]
                      var postfix = data[k].postfix
                      return k == j ? currentScale(d) + postfix : (data[k].value + postfix) || hsla[k];
                    })
                    return 'hsla(' + hsla.join(',') + ')';
                  })  

            colorBarValue.text(function(d) { return (d.key == 'a' ? Math.round(d.value * 100)/100 : Math.round(d.value)) + d.postfix;})

            dispatch.cpupdate(data);
        }

      });

      return colorPicker;
    }

    colorPicker.dispatch = dispatch;

    colorPicker.boxSize = function(_) {
      if (!arguments.length) return boxSize;
      boxSize = _;
      return chart;
    }

    colorPicker.barWidth = function(_) {
      if (!arguments.length) return barWidth;
      barWidth = _;
      return chart;
    }

    colorPicker.barHeight = function(_) {
      if (!arguments.length) return barHeight;
      barHeight = _;
      return chart;
    }

    return colorPicker;

}

cp.converters = cp.converters || {};

cp.converters.dataToHslaString = function(d) {
          var valueString = d.map(function(d) {
            return (d.key == 'a' ? Math.round(d.value * 100)/100 : Math.round(d.value)) + d.postfix;
          }).join(',')
          return 'hsla(' + valueString + ')'
        }

cp.colorSystems = cp.colorSystems || {};

cp.colorSystems.hsla = [
        {'key':'h', 'value':0, 'range':[0,359], 'postfix':''},
        {'key':'s', 'value':100, 'range':[0,100], 'postfix':'%'},
        {'key':'l', 'value':50, 'range':[0,100], 'postfix':'%'},
        {'key':'a', 'value':1, 'range':[0,1], 'postfix':''}
        ];