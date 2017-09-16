const C = require('constants')

class Atk {
  get hostileRooms () {
    Memory.hostileRooms = Memory.hostileRooms || {}
    return Memory.hostileRooms
  }
  get firstHostile () {
    let rooms = Object.keys(this.hostileRooms)
    return this.hostileRooms[rooms[0]]
  }
  run (creep) {
    let tgtroom = creep.memory.tgt = creep.memory.tgt || this.firstHostile.name
    if (!tgtroom) return
    let { room } = creep
    if (room.name !== tgtroom) {
      return creep.travelTo(new RoomPosition(25, 25, tgtroom), {
        offroad: true,
        roomCallback: (room) => { if(this.hostileRooms[room]) return false }
      })
    }
    let tgt
    let structures = _.groupBy(room.find(C.FIND_STRUCTURES), 'structureType')
    if (structures[C.STRUCTURE_SPAWN]) {
      tgt = creep.pos.findClosestByRange(structures[C.STRUCTURE_SPAWN])
    }
    let hostiles = room.find(C.FIND_HOSTILE_CREEPS, { filter (c) { return c.owner.username !== 'Invader' && c.owner.username !== 'Source keeper' } })
    if (hostiles.length) {
      tgt = creep.pos.findClosestByRange(hostiles)
    }
    if (tgt) {
      creep.travelTo(tgt)
      creep.dismantle(tgt)
      creep.attack(tgt)
      creep.rangedAttack(tgt)
    }
  }
}
module.exports = Atk
