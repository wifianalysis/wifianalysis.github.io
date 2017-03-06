var data = null, map = null, heatmap=null, stackUpdate = true,drawing = false,
  filters = [], workset=null, polylines=null;
/* global _ d3 Papa*/
var update = () => {
  setTimeout(update, 500);
  if (!drawing && stackUpdate && map){
    stackUpdate = false
    let obeys = (r,p) => within(p.lat,p.lng,r.latlngs) &&
      r.focus.x.domain()[0]<= p.connect_at && p.connect_at <= r.focus.x.domain()[1],
      mints = +(_(filters).map((r)=>r.focus.x.domain()[0]).min() || 0),
      maxts = +(_(filters).map((r)=>r.focus.x.domain()[1]).max() || Infinity)
    
    workset = _(data).groupBy('device').filter((items, name) => {
      return _(filters).every((rule)=> _(items).some((point)=>obeys(rule,point)))
    }).flatten()
      .filter((e)=>mints<=e.connect_at && e.connect_at<=maxts)
      .value()
    if (heatmap){
      heatmap.remove()    
    }
    let hist = _(workset).countBy((w)=>[w.lat,w.lng]).map((count,point)=>{
      let [lat,lng] = point.split(',')
      return {lat:parseFloat(lat),lng:parseFloat(lng),count:count}
    }).value()
    heatmap = putHeatMap(map, hist)
    
    let chars = getChars(workset);
    document.getElementById('narrative').innerHTML=""
    console.log("chars len",chars.length)
    if (chars.length<=50){
      let scenes = getScenes(workset);
      if (scenes.length<1500){
        console.log("scenes len",chars.length)
        putNarrative(scenes)
      }
    }
  }
}

var within = (x, y, vs)=>{
    var inside = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i].lat, yi = vs[i].lng, xj = vs[j].lat, yj = vs[j].lng;
        let intersect = ((yi > y) != (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}
var putCalender = () =>{
  d3.json("wifi_days.json", function(error, csv) {
    if (error) throw error;
      var width = 560,
    height = 80,
    cellSize = 10; // cell size

  var percent = d3.format(".1%"),
      format = d3.time.format("%Y-%m-%d");

  var color = d3.scale.quantize()
      .domain([-1.05, 1.05])
      .range(d3.range(11).map(function(d) { return "q" + d + "-11"; }));
  var minYear = _(csv).map((x)=>x.date.split('-')[0]|0).min()
  var maxYear = _(csv).map((x)=>x.date.split('-')[0]|0).max()
  
  var svg = d3.select("#calender").selectAll("svg")
      .data(d3.range(minYear, maxYear+1))
    .enter().append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("class", "RdYlGn")
    .append("g")
      .attr("transform", "translate(" + ((width - cellSize * 53) / 2) + "," + (height - cellSize * 7 - 1) + ")");

  svg.append("text")
      .attr("transform", "translate(+6," + cellSize * 3.5 + ")rotate(-90)")
      .style("text-anchor", "middle")
      .text(function(d) { return d; });

  var rect = svg.selectAll(".day")
      .data(function(d) { return d3.time.days(new Date(d, 0, 1), new Date(d + 1, 0, 1)); })
    .enter().append("rect")
      .attr("class", "day")
      .attr("width", cellSize)
      .attr("height", cellSize)
      .attr("x", function(d) { return d3.time.weekOfYear(d) * cellSize; })
      .attr("y", function(d) { return d.getDay() * cellSize; })
      .on('click',(d)=> parseURL('/wifi_csv/'+d+'.csv'))
      .datum(format);

  rect.append("title")
      .text(function(d) { return d; });

  svg.selectAll(".month")
      .data(function(d) { return d3.time.months(new Date(d, 0, 1), new Date(d + 1, 0, 1)); })
    .enter().append("path")
      .attr("class", "month")
      .attr("d", monthPath);

    var avg = _.meanBy(csv,'count')
    var data = d3.nest()
      .key(function(d) { return d.date; })
      .rollup(function(d) { console.log((d[0].count - avg) / avg); return (d[0].count - avg) / avg})
      .map(csv);

    rect.filter(function(d) { return d in data; })

        .attr("class", function(d) { return "day " + color(data[d]); })
      .select("title")
        .text(function(d) { return d + ": " + percent(data[d]); });
      function monthPath(t0) {
    var t1 = new Date(t0.getFullYear(), t0.getMonth() + 1, 0),
        d0 = t0.getDay(), w0 = d3.time.weekOfYear(t0),
        d1 = t1.getDay(), w1 = d3.time.weekOfYear(t1);
    return "M" + (w0 + 1) * cellSize + "," + d0 * cellSize
        + "H" + w0 * cellSize + "V" + 7 * cellSize
        + "H" + w1 * cellSize + "V" + (d1 + 1) * cellSize
        + "H" + (w1 + 1) * cellSize + "V" + 0
        + "H" + (w0 + 1) * cellSize + "Z";
  }
  });

}
var parseURL = (url)=>{
  Papa.parse(url, {
    download: true, header: true,dynamicTyping: true,
    complete: (results) => process(results.data)
  });
}
var init = () => {
  putCalender()
  parseURL('session.csv')
  update()
}

var getContexId = () => 
  _(_.range(1,10)).map(x=> d3.select('path.fc.area'+x).node()===null?x:null)
    .compact().head()

var tenmin = 1000*60*10
var foo = null
var colors = ['',"#00bc9c","#FBB040","#868686","#F14E4E","#363A43","#E0B589"]
var process = (list) => {
  filters.forEach((x)=>{
        x.focus.element.remove();
        x.layer.remove()
  })
  filters = []
  var date = (str)=> (new Date(str.replace(/\s+/g, 'T').concat('.000')))
  data = list.filter((e)=>e.connect_at!==undefined && e.disconnect_at!==undefined && e.lat!=='' && e.lng!=='' )
          .map((e)=>{return {device:e.device, router:e.router.split('_')[0],
                                connect_at:((+date(e.connect_at)/tenmin)|0)*tenmin,
                                disconnect_at:((+date(e.disconnect_at)/tenmin)|0)*tenmin,
                                lat:e.lat,lng:e.lng
  }})
  if (map===null){
    map = putMap('main', _(data).map('lat').filter(isFinite).mean(), _(data).map('lng').filter(isFinite).mean())
    
    map.pm.addControls({
        position: 'topleft',drawMarker: false, drawPolygon: true, 
        drawPolyline: false, editPolygon: false, deleteLayer: true
    });
    map.on('layerremove', (e) => {
      filters.filter((x) => e.layer === x.layer).forEach((x)=>{
        x.focus.element.remove();
      })

      filters = filters.filter((x) => e.layer !== x.layer)
    })
    map.on('pm:create', (e) => {
      let latlngs = e.layer.getLatLngs()[0]
      let hist = _(data).filter((e)=>within(e.lat,e.lng,latlngs))
        .countBy('connect_at').toPairs().sortBy('0')
        .map(e=>{return{date:new Date(parseInt(e[0])),value:e[1]}})
        .sortBy((a,b)=>(+a.date)-(+a.date))
        .value();

      let nextId = getContexId()
      
      d3.select(e.layer._path)
        .style("fill", colors[nextId]).style("stroke", colors[nextId])
      let fc = focusChart(hist, "#focusChart ul", 720, 100)
      d3.select(fc.element).node().select('path')
        .attr('class', 'fc area'+nextId)
        .style("fill", colors[nextId]).style("stroke", colors[nextId])
      filters.push({layer:e.layer,
                          latlngs:e.layer.getLatLngs()[0],
                          focus:fc, cls:nextId})
      
    })
    map.on('pm:drawstart', (e)=>{drawing = true})
    map.on('pm:drawend', (e)=>{drawing = false})
  }
 
  stackUpdate = true;
  //
}

var putMap = (div,lat,lng) =>{
  if (map === null){
    map = new L.Map(div);
    var osmUrl='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    var mapLayer = new L.TileLayer(osmUrl, {minZoom: 8, maxZoom: 19, attribution: false});    
    map.addLayer(mapLayer);
    polylines = L.layerGroup()
    map.addLayer(polylines)
    document.getElementsByClassName( 'leaflet-control-attribution' )[0].style.display = 'none';    
  }
  map.setView(new L.LatLng(lat, lng),17);
  return map
}

var putHeatMap = (map, hist) =>{
    let intensity = 1.0/_(hist).map('count').max()
    let l = _.map(hist,(e)=>[e.lat, e.lng, e.count*intensity])
    var heat = L.heatLayer(l, {radius: 45}).addTo(map);
    var legend = document.getElementById('legend')
    defaultGradient = {.4:"blue",.6:"cyan",.7:"lime",.8:"yellow",1:"red"}
    legend.innerHTML = Object.keys(defaultGradient).sort((a,b)=>{return b-a})
    .map((x)=> {return '<i style="background:' + defaultGradient[x] + '"></i> ' +
           ((x/intensity)|0) +'<br>'}).join('') + "Workset:"+ _.size(_.countBy(workset,'device')) +":" + workset.length 
     return heat
}

var focusChart = (data, placement, reqwidth, reqheight, nid) => {
  var focus, x, x2, y, y2, area,area2, brush, xAxis, yAxis, 
    xAxis_context, yAxis_context, context;
  
  var brushed = () => {
    x.domain(brush.empty() ? x2.domain() : brush.extent());
    focus.select(".area").attr("d", area);
    focus.select(".x.axis").call(xAxis);
  }
  
  var margin = {top: 0, right: 0, bottom: 0, left: 1},
    margin_context = { top: 30, right: 10, bottom: 0, left: 60},
    width = reqwidth - margin.left - margin.right,
    height = reqheight - margin.top - margin.bottom,
    height_context = reqheight - margin_context.top - margin_context.bottom;

  var yscale =  d3.scale.linear();
  
  x = d3.time.scale().range([0, width]),
  x2 = d3.time.scale().range([0, width]),
  y = yscale.range([height, 0]),
  y2 = d3.scale.linear().range([height_context, 0]);
  xAxis = d3.svg.axis().scale(x).orient("bottom"),
  xAxis_context = d3.svg.axis().scale(x2).orient("bottom"),
  yAxis = d3.svg.axis().scale(y).orient("left");
  yAxis_context = d3.svg.axis().scale(y2).orient("left"),
  
  brush = d3.svg.brush().x(x2).on("brush", brushed);

  area = d3.svg.area().interpolate("monotone").x((d) => x(d.date))
    .y0(height).y1((d) => y(d.value))

  var el = d3.select(placement).append('li')
  var svg = el.append("svg")
    .attr({"width": width + margin.left + margin.right, 
      "height": height + margin.top + margin.bottom})

  focus = svg.append("g")

  area2 = d3.svg.area()
    .interpolate("monotone")
    .x((d) => x2(d.date)).y0(height_context).y1((d) => y2(d.value));

    context = svg.append("g")
      .attr("class", "context").attr("transform", "translate(60,0)");

  x.domain(d3.extent(data.map((d) => d.date)));
  y.domain([1, d3.max(data.map((d) => d.value))]);
  x2.domain(x.domain());
  y2.domain(y.domain());

  context.append("path").datum(data)
    .attr({"class":"fc area", "d":area2});

  context.append("g")
    .attr({"class":"fc x axis", transform:"translate(0," + height_context + ")"})
    .call(xAxis_context);
  
  context.append("g")
    .attr("class", "fc y axis")
    .call(yAxis_context);

  context.append("g")
    .attr("class", "fc x brush")
    .call(brush)
    .selectAll("rect")
    .attr({"y":-6, "height":height_context + 7});
  
  return {element:el,x:x,y:y};
}
let doRender= ()=>{stackUpdate=true}

document.getElementById("main").onmouseup = doRender
document.getElementById("focusChart").onmouseup = doRender

var getScenes = (workset) =>{
  var charCache = {}
  let obeys = (r,p) => within(p.lat,p.lng,r.latlngs) 
    // && r.focus.x.domain()[0]<= p.connect_at 
    // && p.connect_at <= r.focus.x.domain()[1]
  let getCls = (x) => {
    console.log(x)
    return _(filters).filter(r=>obeys(r,x)).map(x=>x.cls).head()
  }
  let routers = _(workset).uniqBy('router').groupBy('router').value()
  return _(workset).groupBy('router').map((trj,r)=>
    _(trj).uniqBy('connect_at').map((t)=>{
      return {t:t.connect_at, location:r,
        chars: _(trj).filter((t2)=>
          (t2.connect_at<=t.connect_at)
          && (t.connect_at<=t2.disconnect_at) 
        ).map((x)=>x.device).sortBy().sortedUniq().value()
      }
    }
    ).filter((i)=>(i.chars.length>1)).value()
  ).flatten().sortBy('t').map((x)=>{
    return {
      characters:x.chars.map((e)=>{
        if (!(e in charCache)){
          charCache[e] = {id:e,name:e,affiliation: "light"}
        }
        return charCache[e]
      }),
      t:x.t,
      location:x.location,
      cls:getCls({lat:routers[x.location][0].lat,lng:routers[x.location][0].lng,connect_at:x.t})
    }
  }).value()
}

let getChars = (workset) => _(workset).map((x)=>x.device)
  .sortBy().sortedUniq().value()
var redIcon = new L.Icon({
  iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  //shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});
var greenIcon = new L.Icon({
  iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

var polyline = null;
let highlightChar = (c) => {
  d3.selectAll('[character="'+c+'"]').attr('class','highlight')
  d3.selectAll( d3.selectAll('[class="scene"]>[char="'+c+'"]')[0].map(x=>x.parentNode))
    .attr("class", 'scene-highlight')
  let pointList = _(workset).filter(w=>w.device==c)
    .sortBy('connect_at').map(w=>new L.LatLng(w.lat,w.lng)).value()
  let ts = _(workset).filter(w=>w.device==c)
    .sortBy('connect_at').map(w=>w.connect_at).value()
  var maxTS = _.maxBy(workset,'connect_at').connect_at
  var minTS = _.minBy(workset,'connect_at').connect_at
  
  var grad =   [0,.4,.6,.7,.8,1]
  var colorgrad = ["#4575b4","#91bfdb","#e0f3f8","#fee090","#fc8d59","#d73027"]
  var color = d3.scale.linear()
    .domain(grad)
    .range(colorgrad);
  
  for (var i=0; i<pointList.length-1; i++){
    let [s,e,t] = [pointList[i],pointList[i+1],ts[i]]
    let progress = (t-minTS)/(maxTS-minTS)
    console.log(progress,color(progress))
    let polyline = new L.Polyline([s, e], {
        color: '#e34a33', //color(progress),
        weight: 3,
        opacity: 1,
        smoothFactor: 1
      });
      polyline.addTo(polylines);
  }
  pointList.slice(1,pointList.length-1).map(p=>L.marker(p).addTo(polylines))
  L.marker(pointList[0],{'icon':greenIcon}).addTo(polylines);
  L.marker(pointList[pointList.length-1],{'icon':redIcon}).addTo(polylines);
}
let unhighlightChar = (c) =>{
  d3.selectAll('[character="'+c+'"]').attr("class", "light");
  d3.selectAll('[class="scene-highlight"]').attr("class", 'scene')
  polylines.clearLayers()
}

var highlightScene = (d)=>{
  d.characters.forEach((c)=>highlightChar(c.id))
//  this.attr('class','scene-highlight')
}
var unhighlightScene = (d)=>{
  d.characters.forEach((c)=>unhighlightChar(c.id))
//  this.attr('class','scene')
}
var toggleChar = (d) => {
  let element = d3.select("[intro='"+d+"']")
  if (element.style('opacity')=='1'){
    element.style("opacity", 0.1)
    d3.selectAll('[character="'+d+'"]').style("opacity", 0.1);
  }else{
    element.style("opacity", 1)
    d3.selectAll('[character="'+d+'"]').style("opacity", "");    
  }
}
var toggleScene = (d) => {
  console.log(d)
  // let element = d3.select("[intro='"+d+"']")
  // if (element.style('opacity')=='1'){
  //   element.style("opacity", 0.1)
  //   d3.selectAll('[character="'+d+'"]').style("opacity", 0.1);
  // }else{
  //   element.style("opacity", 1)
  //   d3.selectAll('[character="'+d+'"]').style("opacity", "");    
  // }
}

let putNarrative = (scenes)=>{

	var svg, scenes, charactersMap, width, height, sceneWidth;

	// Get the data in the format we need to feed to d3.layout.narrative().scenes
	//scenes = wrangle(response);

	// Some defaults
	sceneWidth = 10;
	width = scenes.length * sceneWidth * 4;
	height = 600;
	labelSize = [150,15];
    d3.select('#narrative-chart').remove()
	// The container element (this is the HTML fragment);
	svg = d3.select("#narrative").append('svg')
		.attr('id', 'narrative-chart')
		.attr('width', width)
		.attr('height', height);

	// Calculate the actual width of every character label.
	scenes.forEach(function(scene){
		scene.characters.forEach(function(character) {
			character.width = svg.append('text')
				.attr('opacity',0)
				.attr('class', 'temp')
				.text(character.id)
					.node().getComputedTextLength()+10;
		});
	});

	// Remove all the temporary labels.
	svg.selectAll('text.temp').remove();

	// Do the layout
	let narrative = d3.layout.narrative()
		.scenes(scenes)
		.size([width,height])
		.pathSpace(10)
		.groupMargin(200)
		.labelSize([250,15])
		.scenePadding([5,sceneWidth/2,5,sceneWidth/2])
		.labelPosition('left')
		.layout();

	// Get the extent so we can re-size the SVG appropriately.
	svg.attr('height', narrative.extent()[1]);

  var toggleOpacity = (function(){
      return function(){
          let element = d3.select(this)
          if (element.style('opacity')!='0.1'){
            element.style("opacity", "0.1");            
          } else {            
            element.style("opacity", "");
          }
      }
  })();


	// Draw the scenes
	let scenegroup = svg.selectAll('.scene').data(narrative.scenes()).enter()
		.append('g').attr('class', 'scene')
		  .attr({'transform': (d)=>
			    'translate('+[Math.round(d.x)+0.5,Math.round(d.y)+0.5]+')',
			    'event': (d)=>d.location, 't': (d)=>d.t})
			.on("mouseover", (d) => highlightScene(d) )
      .on("mouseout", (d) => unhighlightScene(d) )
      .on("click", toggleOpacity)
	scenegroup
			.append('rect')
				.attr({'width': sceneWidth,'fill':'grey', 'height': (d)=>d.height,
				  'y': 0, 'x': 0, 'rx': 3, 'ry': 3})
				.style('fill',d=>colors[d.cls])
  scenegroup.append('text').text((d)=>d.location+'\t'+(new Date(d.t)).toLocaleTimeString())
    .attr('class','scenetext')

	// Draw appearances
	svg.selectAll('.scene').selectAll('.appearance').data((d)=>d.appearances)
	.enter().append('circle')
		.attr({'cx':(d)=>d.x, 'cy':(d)=>d.y, 'r':()=>2, 'class': (d)=>
			'appearance ' + d.character.affiliation,
			'event': (d)=>d.location, 't': (d)=>d.t, char:(d)=>d.character.id
		});

	// Draw links
	svg.selectAll('.link').data(narrative.links()).enter()
		.append('path')
		.attr('class', (d) =>  'link ' + d.character.affiliation.toLowerCase())
		.attr('character', (d) => d.character.id)
		.on("mouseover", (d) => highlightChar(d.character.id) )
        .on("mouseout", (d) => unhighlightChar(d.character.id) )
		.attr('d', narrative.link());

	// Draw intro nodes
	svg.selectAll('.intro').data(narrative.introductions())
		.enter().call((s) => {
			var g = s.append('g').attr('class', 'intro');
			g.append('rect').attr({'y': -4, 'x':-4, 'width': 4, 'height': 8})
        		
			var text = g.append('g').attr('class','text')
      .attr('intro',(d)=>d.character.id)
			text.append('text')
			text.append('text').attr('class', 'color')

			g.attr('transform', (d)=> 'translate(' + [Math.round(d.x),Math.round(d.y)] + ')');

			g.selectAll('text')
				.attr('text-anchor', 'end')
				.attr('y', '4px')
				.attr('x', '-8px')
				.text((d)=> d.character.id )
            .on("mouseover", (d) => highlightChar(d.character.id) )
            .on("mouseout", (d) => unhighlightChar(d.character.id) )
            .on("click", (d) => toggleChar(d.character.id) )

			g.select('.color')
				.attr('class', (d) => 'color ' + d.character.affiliation)

			g.select('rect')
				.attr('class', (d)=>d.character.affiliation)
		});
}
