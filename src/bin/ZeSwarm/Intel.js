import C from '/include/constants'
import each from 'lodash-es/each'

export default class Intel {
  constructor (context) {
    this.context = context
    this.kernel = context.queryPosisInterface('baseKernel')
    this.sleep = context.queryPosisInterface('sleep')
    this.int = context.queryPosisInterface('interrupt')
    this.segments = context.queryPosisInterface('segments')
  }

  get log () {
    return this.context.log
  }

  run () {
    if (this.segments.load(C.SEGMENTS.INTEL) === false) {
      this.segments.activate(C.SEGMENTS.INTEL)
      this.int.clearAllInterrupts()
      this.int.wait(C.INT_TYPE.SEGMENT, C.INT_STAGE.START, C.SEGMENTS.INTEL)
    } else {
      this.int.setInterrupt(C.INT_TYPE.VISION, C.INT_STAGE.START)
      // this.sleep.sleep(10)
    }
    if (Game.flags.map) {
      this.log.warn('Map rendering is enabled')
      // this.drawMap()
      this.drawMapImage()
    }
  }

  INTERRUPT ({ hook: { type, stage }, key }) {
    this.log.info(`Collecting intel on ${key}`)
    let room = Game.rooms[key]
    let mem = this.segments.load(C.SEGMENTS.INTEL) || {}
    let hr = mem.rooms = mem.rooms || {}
    let {
      name,
      controller: {
        id,
        level,
        pos,
        my,
        safeMode,
        owner: { username: owner } = {},
        reservation: { username: reserver, ticksToEnd } = {}
      } = {}
    } = room

    let structs = room.structures.all
    let byType = room.structures
    let [ mineral ] = room.find(C.FIND_MINERALS)
    let { mineralType } = mineral || {}
    let smap = ({ id, pos }) => ({ id, pos })
    let cmap = ({ id, pos, body, hits, hitsMax }) => ({ id, pos, body, hits, hitsMax })
    hr[room.name] = {
      hostile: level && !my,
      name,
      level,
      owner,
      reserver,
      spawns: room.spawns.map(smap),
      towers: room.towers.map(smap),
      walls: room.constructedWalls.length,
      ramparts: room.ramparts.length,
      creeps: room.find(C.FIND_HOSTILE_CREEPS).map(cmap),
      safemode: safeMode || 0,
      controller: id && { id, pos },
      sources: room.find(C.FIND_SOURCES).map(smap),
      mineral: mineralType,
      ts: Game.time
    }
    this.segments.save(C.SEGMENTS.INTEL, mem)
  }

  drawMap () {
    const mem = this.segments.load(C.SEGMENTS.INTEL) || {}
    const { rooms = {} } = mem
    const vis = new RoomVisual()
    let minx = 1000
    let miny = 1000
    let maxx = -1000
    let maxy = -1000

    const start = Game.cpu.getUsed()
    each(rooms, room => {
      // TODO: do string manip rather than regex
      let [ , ew, x, ns, y ] = room.name.match(/^([EW])(\d+)([NS])(\d+)$/)
      x = parseInt(x)
      y = parseInt(y)
      if (ew === 'W') x = -x
      else x += 1
      if (ns === 'N') y = -(y - 1)
      minx = Math.min(minx, x)
      miny = Math.min(miny, y)
      maxx = Math.max(maxx, x)
      maxy = Math.max(maxy, y)
      room.x = x
      room.y = y
    })
    each(rooms, room => {
      let color = 'white'
      if (room.owner === C.USER) color = '#00FF00'
      if (room.hostile) color = '#FF0000'
      if (room.reserver && room.reserver === C.USER) color = '#77FF77'
      if (room.reserver && room.reserver !== C.USER) color = '#FF7777'
      if (room.safemode && room.hostile) color = 'orange'
      // let [x, y] = [room.x - minx, room.y - miny]
      let [x, y] = [50 - maxx + room.x - 2, room.y - miny + 1]
      vis.rect(x - 0.5, y - 0.5, 1, 1, {
        fill: color
      })
      if (room.level) {
        vis.text(room.level, x, y + 0.2)
      }
      if (room.sources) {
        vis.text(room.sources.length, x - 0.3, y - 0.2, { size: 0.4 })
      }
      if (room.mineral) {
        vis.text(room.mineral, x + 0.3, y - 0.2, { size: 0.4 })
      }
      if (room.towers) {
        vis.text(room.towers.length, x + 0.3, y + 0.2, { size: 0.4 })
      }
      if (room.username) {
        vis.text(room.username.slice(0, 6), x, y + 0.5, { size: 0.35 })
      }
      if (room.owner) {
        vis.text(room.owner.slice(0, 6), x, y + 0.5, { size: 0.35 })
      }
      if (room.reserver) {
        vis.text(room.reserver.slice(0, 6), x, y + 0.5, { size: 0.35 })
      }
      if (room.ts) {
        let val = Math.min(100, ((Game.time - room.ts) / 2000) * 100)
        let color = this.getColorBasedOnPercentage(val) // hsv2rgb(val, 0.5, 1)
        vis.circle(x, y, { radius: 0.2, fill: color, color })
      }
      const exits = Game.map.describeExits(room.name)
      if (!exits[C.TOP]) {
        vis.line(x - 0.5, y - 0.5, x + 0.5, y - 0.5, { color: 'black', width: 0.1, opacity: 1 })
      }
      if (!exits[C.BOTTOM]) {
        vis.line(x - 0.5, y + 0.5, x + 0.5, y + 0.5, { color: 'black', width: 0.1, opacity: 1 })
      }
      if (!exits[C.LEFT]) {
        vis.line(x - 0.5, y - 0.5, x - 0.5, y + 0.5, { color: 'black', width: 0.1, opacity: 1 })
      }
      if (!exits[C.RIGHT]) {
        vis.line(x + 0.5, y - 0.5, x + 0.5, y + 0.5, { color: 'black', width: 0.1, opacity: 1 })
      }
    })
    const end = Game.cpu.getUsed()
    vis.text((end - start).toFixed(2), 1, 0)
  }

  drawMapImage () {
    const mem = this.segments.load(C.SEGMENTS.INTEL) || {}
    const { rooms = {} } = mem
    
    const id = `map_${Game.time}`
    const func = [
        renderRooms.toString()
          .replace(/C\.USER/g,`'${C.USER}'`)
          .replace(/Game\.time/g,Game.time.toString()),
        getColorBasedOnPercentage.toString(),
        hsv2rgb.toString()
      ]
      .map(s => s.replace(/^\w+\/\/(.+?)$/g, '').replace(/\n/g,' '))
      .join('; ')
    const script = `${loadScripts.toString()}; loadScripts(90, 91, ${C.SEGMENTS.INTEL})`
    console.log(`<script>${script.replace(/\n/g,' ')}</script>`)
    let exits = {}
    each(rooms, (room) => {
      exits[room.name] = Game.map.describeExits(room.name)
    })
    this.segments.save(90, func)
    this.segments.save(91, { exits })
  }


}
function getColorBasedOnPercentage (thePercentage) { /* Credit goes to Dissi for this */
  var hue = Math.floor((100 - thePercentage) * 120 / 100);  /* go from green to red */
  var saturation = Math.abs(thePercentage - 50) / 50;
  return hsv2rgb(hue, saturation, 1);
}

function hsv2rgb (h, s, v) {
  /* adapted from http://schinckel.net/2012/01/10/hsv-to-rgb-in-javascript/ */
  var rgb, i, data = [];
  if (s === 0) {
    rgb = [v, v, v];
  } else {
    h = h / 60;
    i = Math.floor(h);
    data = [v * (1 - s), v * (1 - s * (h - i)), v * (1 - s * (1 - (h - i)))];
    switch (i) {
      case 0:
        rgb = [v, data[2], data[0]];
        break;
      case 1:
        rgb = [data[1], v, data[0]];
        break;
      case 2:
        rgb = [data[0], v, data[2]];
        break;
      case 3:
        rgb = [data[0], data[1], v];
        break;
      case 4:
        rgb = [data[2], data[0], v];
        break;
      default:
        rgb = [v, data[0], data[1]];
        break;
    }
  }
  return '#' + rgb.map(function (x) {
    return ('0' + Math.round(x * 255).toString(16)).slice(-2);
  }).join('');
}

function renderRooms(rooms, exitMap) {
  const C = angular.element($('section.game')).injector().get('Constants')
  const each = _.forEach;
  let minx = 1000;
  let miny = 1000;
  let maxx = -1000;
  let maxy = -1000;
  each(rooms, room => {
    /* TODO: do string manip rather than regex */
    let [ , ew, x, ns, y ] = room.name.match(/^([EW])(\d+)([NS])(\d+)$/);
    x = parseInt(x);
    y = parseInt(y);
    if (ew === 'W') x = -x;
    else x += 1;
    if (ns === 'N') y = -(y - 1);
    minx = Math.min(minx, x);
    miny = Math.min(miny, y);
    maxx = Math.max(maxx, x);
    maxy = Math.max(maxy, y);
    room.x = x;
    room.y = y;
  });
  const canvas = document.createElement('canvas');
  const scale = Math.floor(1000 / (maxx - minx));
  const h = scale/2
  canvas.width = (maxx - minx) * scale;
  canvas.height = (maxy - miny) * scale;
  const ctx = canvas.getContext('2d');
  /* ctx.scale(0.2, 0.2);  */
  /* ctx.scale(scale, scale)  */
  each(rooms, room => {
    let color = 'white';
    if (room.owner === C.USER) { color = '#00FF00'; }
    if (room.hostile) { color = '#FF0000'; }
    if (room.reserver && room.reserver === C.USER) { color = '#77FF77'; }
    if (room.reserver && room.reserver !== C.USER) { color = '#FF7777'; }
    if (room.safemode && room.hostile) { color = 'orange'; }
    let [x, y] = [room.x - minx, room.y - miny] 
    /* let [x, y] = [50 - maxx + room.x - 2, room.y - miny + 1]; */
    x *= scale;
    y *= scale;
    ctx.save()
    ctx.translate(x,y)
    ctx.beginPath();
    ctx.rect(0, 0, scale, scale);
    ctx.fillStyle = color;
    ctx.fill();

    if (room.ts) {
      let val = Math.min(100, ((Game.time - room.ts) / 2000) * 100);
      let color = getColorBasedOnPercentage(val);
      ctx.beginPath();
      ctx.arc(h, h, scale * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    let info = []
    if (room.level) {
      info.push(`Level: ${room.level}`)
    }
    if (room.sources) {
      info.push(`Sources: ${room.sources.length}`)
    }
    if (room.mineral) {
      info.push(`Mineral: ${room.mineral}`)
    }
    if (room.towers) {
      info.push(`Towers: ${room.towers.length}`)
    }
    if (room.owner) {
      info.push(`Owner: ${room.owner}`)
    }
    if (room.reserver) {
      info.push(`Reserver: ${room.reserver}`)
    }
    ctx.fillStyle = 'black';
    ctx.font = `${scale * 0.1}px arial` /* '4%' */
    for (let i = 0; i < info.length; i++) {
      ctx.fillText(info[i], 5, 5 + ((scale * 0.1) * (i + 1)))
    }
    const exits = exitMap[room.name]
    ctx.save();
    ctx.beginPath();
    if (!exits[C.TOP]) {
      ctx.moveTo(0, 0);
      ctx.lineTo(scale, 0);
    }
    if (!exits[C.BOTTOM]) {
      ctx.moveTo(0, scale);
      ctx.lineTo(scale, scale);
    }
    if (!exits[C.LEFT]) {
      ctx.moveTo(0, 0);
      ctx.lineTo(0, scale);
    }
    if (!exits[C.RIGHT]) {
      ctx.moveTo(scale, 0);
      ctx.lineTo(scale, scale);
    }
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  });
  const url = canvas.toDataURL();
  console.log(url)
  const w = window.open("", 'mapImage');
  const image = new Image();
  image.src = url
  w.document.body.innerHTML = image.outerHTML + `<style> body { background-color: #CCCCCC } img { position: fixed; top: 0; bottom: 0; left: 0; right: 0; width: 1000px; }</style>`
}

async function loadScripts(funcID, extrasID, roomsID) {
  const conn = angular.element($('section.game')).injector().get('Connection');
  eval(await conn.getMemorySegment(null, funcID));
  const { rooms } = JSON.parse(await conn.getMemorySegment(null, roomsID));
  const { exits } = JSON.parse(await conn.getMemorySegment(null, extrasID));
  renderRooms(rooms, exits)
}