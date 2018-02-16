const C = require('./constants')

class HostileTracker {
  constructor () {
    Memory.hostileTracker = Memory.hostileTracker || {}
  }
  get mem () {
    Memory.hostileTracker = Memory.hostileTracker || {}
    return Memory.hostileTracker
  }
  tick () {
    _.each(Game.rooms, room => this.analyze(room))
    let { rooms } = this.mem
    let vis = new RoomVisual()
    let minx = 1000
    let miny = 1000
    let maxx = -1000
    let maxy = -1000

    _.forEach(rooms, room => {
      let [ , ew, x, ns, y ] = room.name.match(/^([EW])(\d+)([NS])(\d+)$/)
      if (ew === 'W') x = -x
      else x -= 1
      if (ns === 'N') y = -(y - 1)
      minx = Math.min(minx, x)
      miny = Math.min(miny, y)
      maxx = Math.max(maxx, x)
      maxy = Math.max(maxy, y)
      room.x = x
      room.y = y
    })
    let start = Game.cpu.getUsed()
    _.forEach(rooms, room => {
      let color = 'white'
      if (room.username === C.USER) color = 'green'
      if (room.hostile) color = 'red'
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
        vis.text(room.sources, x - 0.3, y - 0.2, { size: 0.4 })
      }
      if (room.mineral) {
        vis.text(room.mineral, x + 0.3, y - 0.2, { size: 0.4 })
      }
      if (room.towers) {
        vis.text(room.towers, x + 0.3, y + 0.2, { size: 0.4 })
      }
      if (room.username) {
        vis.text(room.username.slice(0, 6), x, y + 0.5, { size: 0.35 })
      }
      if (room.ts) {
        let val = Math.min(100, ((Game.time - room.ts) / 2000) * 100)
        let color = getColorBasedOnPercentage(val) // hsv2rgb(val, 0.5, 1)
        vis.circle(x, y, { radius: 0.2, fill: color, color })
      }
      let exits = Game.map.describeExits(room.name)
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
    let end = Game.cpu.getUsed()
    vis.text((end - start).toFixed(2), 1, 0)
  }
  getRoom (room) {
    return this.mem.rooms[room] || {}
  }
  getRooms () {
    return this.mem.rooms
  }
  analyze (room) {
    let hr = this.mem.rooms = this.mem.rooms || {}
    let {
      name,
      controller: {
        level,
        my,
        safeMode,
        owner: { username } = {}
      } = {}
    } = room

    let structs = room.find(C.FIND_STRUCTURES)
    let byType = _.groupBy(structs, 'structureType')
    let [ mineral ] = room.find(C.FIND_MINERALS)
    let { mineralType } = mineral || {}
    hr[room.name] = {
      hostile: level && !my,
      name,
      level,
      username,
      spawns: (byType[C.STRUCTURE_SPAWN] || []).length,
      towers: (byType[C.STRUCTURE_TOWER] || []).length,
      walls: (byType[C.STRUCTURE_WALL] || []).length,
      ramparts: (byType[C.STRUCTURE_RAMPART] || []).length,
      creeps: room.find(C.FIND_HOSTILE_CREEPS).length,
      safemode: safeMode || 0,
      sources: room.find(C.FIND_SOURCES).length,
      mineral: mineralType,
      ts: Game.time
    }
  }
}

module.exports = new HostileTracker()

function getColorBasedOnPercentage(thePercentage)
{
    var hue = Math.floor((100 - thePercentage) * 120 / 100);  // go from green to red
    var saturation = Math.abs(thePercentage - 50)/50;
    return hsv2rgb(hue, saturation, 1);
}

var hsv2rgb = function(h, s, v) {
  // adapted from http://schinckel.net/2012/01/10/hsv-to-rgb-in-javascript/
  var rgb, i, data = [];
  if (s === 0) {
    rgb = [v,v,v];
  } else {
    h = h / 60;
    i = Math.floor(h);
    data = [v*(1-s), v*(1-s*(h-i)), v*(1-s*(1-(h-i)))];
    switch(i) {
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
  return '#' + rgb.map(function(x){
    return ("0" + Math.round(x*255).toString(16)).slice(-2);
  }).join('');
};

