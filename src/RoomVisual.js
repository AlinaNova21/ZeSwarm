const colors = {
  gray: '#555555',
  light: '#AAAAAA',
  road: '#666', // >:D
  energy: '#FFE87B',
  power: '#F53547',
  dark: '#181818',
  outline: '#8FBB93',
  speechText: '#000000',
  speechBackground: '#2ccf3b'
}

const speechSize = 0.5
const speechFont = 'Times New Roman'

RoomVisual.prototype.structure = function(x,y,type,opts={}){
  opts = Object.assign({
    opacity: 1
  },opts)
  switch(type){
    case STRUCTURE_EXTENSION:
      this.circle(x,y,{
        radius: 0.3,
        fill: colors.dark,
        stroke: colors.outline,
        strokeWidth: 0.05,
        opacity: opts.opacity
      })
      this.circle(x,y,{
        radius: 0.25,
        fill: colors.gray,
        opacity: opts.opacity
      })
      break
    case STRUCTURE_SPAWN:
      this.circle(x,y,{
        radius: 0.65,
        fill: colors.dark,
        stroke: '#CCCCCC',
        strokeWidth: 0.10,
        opacity: opts.opacity
      })
      this.circle(x,y,{
        radius: 0.40,
        fill: colors.energy,
        opacity: opts.opacity
      })

      break;
    case STRUCTURE_POWER_SPAWN:
      this.circle(x,y,{
        radius: 0.65,
        fill: colors.dark,
        stroke: colors.power,
        strokeWidth: 0.10,
        opacity: opts.opacity
      })
      this.circle(x,y,{
        radius: 0.40,
        fill: colors.energy,
        opacity: opts.opacity
      })
      break;
    case STRUCTURE_LINK:
    {
      let osize = 0.3
      let isize = 0.2
      let outer = [
        [0.0,-0.5],
        [0.4,0.0],
        [0.0,0.5],
        [-0.4,0.0]
      ]
      let inner = [
        [0.0,-0.3],
        [0.25,0.0],
        [0.0,0.3],
        [-0.25,0.0]
      ]
      outer = relPoly(x,y,outer)
      inner = relPoly(x,y,inner)
      outer.push(outer[0])
      inner.push(inner[0])
      this.poly(outer,{
        fill: colors.dark,
        stroke: colors.outline,
        strokeWidth: 0.05,
        opacity: opts.opacity
      })
      this.poly(inner,{
        fill: colors.gray,
        stroke: false,
        opacity: opts.opacity
      })
      break;
    }
    case STRUCTURE_TERMINAL:
    {
      let outer = [
        [0.0,-0.8],
        [0.55,-0.55],
        [0.8,0.0],
        [0.55,0.55],
        [0.0,0.8],
        [-0.55,0.55],
        [-0.8,0.0],
        [-0.55,-0.55],
      ]
      let inner = [
        [0.0,-0.65],
        [0.45,-0.45],
        [0.65,0.0],
        [0.45,0.45],
        [0.0,0.65],
        [-0.45,0.45],
        [-0.65,0.0],
        [-0.45,-0.45],
      ]
      outer = relPoly(x,y,outer)
      inner = relPoly(x,y,inner)
      outer.push(outer[0])
      inner.push(inner[0])
      this.poly(outer,{
        fill: colors.dark,
        stroke: colors.outline,
        strokeWidth: 0.05,
        opacity: opts.opacity
      })
      this.poly(inner,{
        fill: colors.light,
        stroke: false,
        opacity: opts.opacity
      })
      this.rect(x-0.45,y-0.45,0.9,0.9,{
        fill: colors.gray,
        stroke: colors.dark,
        strokeWidth: 0.1,
        opacity: opts.opacity
      })
      break;
    }
    case STRUCTURE_LAB:
      this.circle(x,y-0.025,{
        radius: 0.55,
        fill: colors.dark,
        stroke: colors.outline,
        strokeWidth: 0.05,
        opacity: opts.opacity
      })
      this.circle(x,y-0.025,{
        radius: 0.40,
        fill: colors.gray,
        opacity: opts.opacity
      })
      this.rect(x-0.45,y+0.3,0.9,0.25,{
        fill: colors.dark,
        stroke: false,
        opacity: opts.opacity
      })
      {
        let box = [
          [-0.45,0.3],
          [-0.45,0.55],
          [0.45,0.55],
          [0.45,0.3],
        ]
        box = relPoly(x,y,box)
        this.poly(box,{
          stroke: colors.outline,
          strokeWidth: 0.05,
          opacity: opts.opacity
        })
      }
      break
    case STRUCTURE_TOWER:
      this.circle(x,y,{
        radius: 0.6,
        fill: colors.dark,
        stroke: colors.outline,
        strokeWidth: 0.05,
        opacity: opts.opacity
      })
      this.rect(x-0.4,y-0.3,0.8,0.6,{
        fill: colors.gray,
        opacity: opts.opacity
      })
      this.rect(x-0.2,y-0.9,0.4,0.5,{
        fill: colors.light,
        stroke: colors.dark,
        strokeWidth: 0.07,
        opacity: opts.opacity
      })
      break;
    case STRUCTURE_ROAD:
      this.circle(x,y,{
        radius: 0.175,
        fill: colors.road,
        stroke: false,
        opacity: opts.opacity
      })
      if(!this.roads) this.roads = []
      this.roads.push([x,y])
      break;
    case STRUCTURE_RAMPART:
      this.circle(x,y,{
        radius: 0.65,
        fill: '#434C43',
        stroke: '#5D735F',
        strokeWidth: 0.10,
        opacity: opts.opacity
      })
      break;
    case STRUCTURE_WALL:
      this.circle(x,y,{
        radius: 0.40,
        fill: colors.dark,
        stroke: colors.light,
        strokeWidth: 0.05,
        opacity: opts.opacity
      })
      break;
    case STRUCTURE_STORAGE:
      let outline1 = relPoly(x, y, [
	[-0.45, -0.55],
	[0, -0.65],
	[0.45, -0.55],
	[0.55, 0],
	[0.45, 0.55],
	[0, 0.65],
	[-0.45, 0.55],
	[-0.55, 0],
	[-0.45, -0.55],
      ])
      this.poly(outline1, {
	stroke: colors.outline,
    	strokeWidth: 0.05,
	fill: colors.dark,
	opacity: opts.opacity
      })
      this.rect(x - 0.35, y - 0.45, 0.7, 0.9, {
	fill: colors.energy,
	opacity: opts.opacity,
      })
      break;
    case STRUCTURE_OBSERVER:
      this.circle(x, y, {
        fill: colors.dark,
        radius: 0.45,
        stroke: colors.outline,
        strokeWidth: 0.05,
        opacity: opts.opacity
      })
      this.circle(x + 0.225, y, {
        fill: colors.outline,
        radius: 0.20,
        opacity: opts.opacity
      })
      break;
    case STRUCTURE_NUKER:
      let outline = [
        [0,-1],
        [-0.47,0.2],
        [-0.5,0.5],
        [0.5,0.5],
        [0.47,0.2],
        [0,-1],
      ];
      outline = relPoly(x,y,outline)
      this.poly(outline,{
        stroke: colors.outline,
        strokeWidth: 0.05,
        fill: colors.dark,
        opacity: opts.opacity
      })
      let inline = [
        [0,-.80],
        [-0.40,0.2],
        [0.40,0.2],
        [0,-.80],
      ]
      inline = relPoly(x,y,inline)
      this.poly(inline,{
        stroke: colors.outline,
        strokeWidth: 0.01,
        fill: colors.gray,
        opacity: opts.opacity
      })
      break;
    case STRUCTURE_CONTAINER:
			this.rect(x - 0.225, y - 0.3, 0.45, 0.6,{
					fill: "yellow",
					opacity: opts.opacity,
					stroke: colors.dark,
					strokeWidth: 0.10,
				});
			break;
    default:
      this.circle(x, y, {
        fill: colors.light,
        radius: 0.35,
        stroke: colors.dark,
        strokeWidth: 0.20,
        opacity: opts.opacity
      })
      break;
  }
  
  return this;
}

const dirs = [
  [],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1]
]

RoomVisual.prototype.connectRoads = function(opts={}){
  let color = opts.color || colors.road || 'white'
  if(!this.roads) return
  // this.text(this.roads.map(r=>r.join(',')).join(' '),25,23)
  this.roads.forEach(r=>{
    // this.text(`${r[0]},${r[1]}`,r[0],r[1],{ size: 0.2 })
    for(let i=1;i<=4;i++){
      let d = dirs[i]
      let c = [r[0]+d[0],r[1]+d[1]]
      let rd = _.some(this.roads,r=>r[0] == c[0] && r[1] == c[1])
      // this.text(`${c[0]},${c[1]}`,c[0],c[1],{ size: 0.2, color: rd?'green':'red' })
      if(rd){
        this.line(r[0],r[1],c[0],c[1],{
          color: color,
          width: 0.35,
          opacity: opts.opacity || 1
        })
      }
    }
  })
  
  return this;
}


RoomVisual.prototype.speech = function(text, x, y, opts={}) {
  var background = !!opts.background ? opts.background : colors.speechBackground
  var textcolor = !!opts.textcolor ? opts.textcolor : colors.speechText
  var textstyle = !!opts.textstyle ? opts.textstyle : false
  var textsize = !!opts.textsize ? opts.textsize : speechSize
  var textfont = !!opts.textfont ? opts.textfont : speechFont
  var opacity = !!opts.opacity ? opts.opacity : 1

  var fontstring = ''
  if(textstyle) {
    fontstring = textstyle + ' '
  }
  fontstring += textsize + ' ' + textfont

  let pointer = [
    [-0.2, -0.8],
    [ 0.2, -0.8],
    [ 0,   -0.3]
  ]
  pointer = relPoly(x,y,pointer)
  pointer.push(pointer[0])

  this.poly(pointer,{
    fill: background,
    stroke: background,
    opacity: opacity,
    strokeWidth: 0.0
  })

  this.text(text, x, y-1, {
    color: textcolor,
    backgroundColor: background,
    backgroundPadding: 0.1,
    opacity: opacity,
    font: fontstring
  })
  
  return this;
}


RoomVisual.prototype.animatedPosition = function (x, y, opts={}) {

  let color = !!opts.color ? opts.color : 'blue'
  let opacity = !!opts.opacity ? opts.opacity : 0.5
  let radius = !!opts.radius ? opts.radius : 0.75
  let frames = !!opts.frames ? opts.frames : 6


  let angle = (Game.time % frames * 90 / frames) * (Math.PI / 180);
  let s = Math.sin(angle);
  let c = Math.cos(angle);

  let sizeMod = Math.abs(Game.time % frames - frames / 2) / 10;
  radius += radius * sizeMod;

  let points = [
      rotate(0, -radius, s, c, x, y),
      rotate(radius, 0, s, c, x, y),
      rotate(0, radius, s, c, x, y),
      rotate(-radius, 0, s, c, x, y),
      rotate(0, -radius, s, c, x, y),
  ];

  this.poly(points, {stroke: color, opacity: opacity});
  
  return this;
}

function rotate(x, y, s, c, px, py) {
  let xDelta = x * c - y * s;
  let yDelta = x * s + y * c;
  return { x: px + xDelta, y: py + yDelta };
}


function relPoly(x,y,poly){
  return poly.map(p=>{
    p[0] += x
    p[1] += y
    return p
  })
}

RoomVisual.prototype.test = function test(){
  let demopos = [19,24]
  this.clear()
  this.structure(demopos[0]+0,demopos[1]+0,STRUCTURE_LAB)
  this.structure(demopos[0]+1,demopos[1]+1,STRUCTURE_TOWER)
  this.structure(demopos[0]+2,demopos[1]+0,STRUCTURE_LINK)
  this.structure(demopos[0]+3,demopos[1]+1,STRUCTURE_TERMINAL)
  this.structure(demopos[0]+4,demopos[1]+0,STRUCTURE_EXTENSION)
  this.structure(demopos[0]+5,demopos[1]+1,STRUCTURE_SPAWN)
  
  return this;
}


/// #region RESOURCE BADGES
const ColorSets = {
  white:  ["#ffffff", "#4c4c4c"],
  grey:   ["#b4b4b4", "#4c4c4c"],
  red:    ["#ff7b7b", "#592121"],
  yellow: ["#fdd388", "#5d4c2e"],
  green:  ["#00f4a2", "#236144"],
  blue:   ["#50d7f9", "#006181"],
  purple: ["#a071ff", "#371383"],
};
const ResourceColors = {
  [RESOURCE_ENERGY]:    ColorSets.yellow,
  [RESOURCE_POWER]:     ColorSets.red,
  
  [RESOURCE_HYDROGEN]:  ColorSets.grey,
  [RESOURCE_OXYGEN]:    ColorSets.grey,
  [RESOURCE_UTRIUM]:    ColorSets.blue,
  [RESOURCE_LEMERGIUM]: ColorSets.green,
  [RESOURCE_KEANIUM]:   ColorSets.purple,
  [RESOURCE_ZYNTHIUM]:  ColorSets.yellow,
  [RESOURCE_CATALYST]:  ColorSets.red,
  [RESOURCE_GHODIUM]:   ColorSets.white,

  [RESOURCE_HYDROXIDE]:         ColorSets.grey,
  [RESOURCE_ZYNTHIUM_KEANITE]:  ColorSets.grey,
  [RESOURCE_UTRIUM_LEMERGITE]:  ColorSets.grey,

  [RESOURCE_UTRIUM_HYDRIDE]:    ColorSets.blue,
  [RESOURCE_UTRIUM_OXIDE]:      ColorSets.blue,
  [RESOURCE_KEANIUM_HYDRIDE]:   ColorSets.purple,
  [RESOURCE_KEANIUM_OXIDE]:     ColorSets.purple,
  [RESOURCE_LEMERGIUM_HYDRIDE]: ColorSets.green,
  [RESOURCE_LEMERGIUM_OXIDE]:   ColorSets.green,
  [RESOURCE_ZYNTHIUM_HYDRIDE]:  ColorSets.yellow,
  [RESOURCE_ZYNTHIUM_OXIDE]:    ColorSets.yellow,
  [RESOURCE_GHODIUM_HYDRIDE]:   ColorSets.white,
  [RESOURCE_GHODIUM_OXIDE]:     ColorSets.white,

  [RESOURCE_UTRIUM_ACID]:       ColorSets.blue,
  [RESOURCE_UTRIUM_ALKALIDE]:   ColorSets.blue,
  [RESOURCE_KEANIUM_ACID]:      ColorSets.purple,
  [RESOURCE_KEANIUM_ALKALIDE]:  ColorSets.purple,
  [RESOURCE_LEMERGIUM_ACID]:    ColorSets.green,
  [RESOURCE_LEMERGIUM_ALKALIDE]:ColorSets.green,
  [RESOURCE_ZYNTHIUM_ACID]:     ColorSets.yellow,
  [RESOURCE_ZYNTHIUM_ALKALIDE]: ColorSets.yellow,
  [RESOURCE_GHODIUM_ACID]:      ColorSets.white,
  [RESOURCE_GHODIUM_ALKALIDE]:  ColorSets.white,

  [RESOURCE_CATALYZED_UTRIUM_ACID]:         ColorSets.blue,
  [RESOURCE_CATALYZED_UTRIUM_ALKALIDE]:     ColorSets.blue,
  [RESOURCE_CATALYZED_KEANIUM_ACID]:        ColorSets.purple,
  [RESOURCE_CATALYZED_KEANIUM_ALKALIDE]:    ColorSets.purple,
  [RESOURCE_CATALYZED_LEMERGIUM_ACID]:      ColorSets.green,
  [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE]:  ColorSets.green,
  [RESOURCE_CATALYZED_ZYNTHIUM_ACID]:       ColorSets.yellow,
  [RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE]:   ColorSets.yellow,
  [RESOURCE_CATALYZED_GHODIUM_ACID]:        ColorSets.white,
  [RESOURCE_CATALYZED_GHODIUM_ALKALIDE]:    ColorSets.white,
};


RoomVisual.prototype.resource = function(type, x, y, size = 0.25){
  if (type == RESOURCE_ENERGY || type == RESOURCE_POWER)
      this._fluid(type, x, y, size);
  else if ([RESOURCE_CATALYST, RESOURCE_HYDROGEN, RESOURCE_OXYGEN, RESOURCE_LEMERGIUM, RESOURCE_UTRIUM, RESOURCE_ZYNTHIUM, RESOURCE_KEANIUM]
      .includes(type))
      this._mineral(type, x, y, size);
  else if (ResourceColors[type] != undefined)
      this._compound(type, x, y, size);
  else
      return ERR_INVALID_ARGS
  return OK;
};
RoomVisual.prototype._fluid = function (type, x, y, size = 0.25) {
  this.circle(x, y, {
      radius: size,
      fill: ResourceColors[type][0],
      opacity: 1,
  })
  this.text(type[0], x, y-(size*0.1), {
      font: (size*1.5),
      color: ResourceColors[type][1],
      backgroundColor: ResourceColors[type][0],
      backgroundPadding: 0,
  })
};
RoomVisual.prototype._mineral = function (type, x, y, size = 0.25) {
  this.circle(x, y, {
      radius: size,
      fill: ResourceColors[type][0],
      opacity: 1,
  })
  this.circle(x, y, {
      radius: size * 0.8,
      fill: ResourceColors[type][1],
      opacity: 1,
  })
  this.text(type, x, y+(size*0.03), {
      font: "bold "+(size*1.25)+" arial",
      color: ResourceColors[type][0],
      backgroundColor: ResourceColors[type][1],
      backgroundPadding: 0,
  })
};
RoomVisual.prototype._compound = function (type, x, y, size = 0.25) {
  let label = type.replace("2", '₂');
  
  this.text(label, x, y, {
      font: "bold "+(size*1)+" arial",
      color: ResourceColors[type][1],
      backgroundColor: ResourceColors[type][0],
      backgroundPadding: 0.3*size,
  })
};
/// #endregion