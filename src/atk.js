const C = require('constants')
const hostileTracker = require('HostileTracker')

class Atk {
  get firstHostile () {
    let room = _.find(hostileTracker.getRooms(), r => r.hostile && !r.towers)
    return room
  }
  run (creep) {
    let tgtroom = creep.memory.tgt = creep.memory.tgt || this.firstHostile.name
    if (!tgtroom) return
    let { name, room } = creep
    if (room.name !== tgtroom) {
      console.log(`${name} Going to ${tgtroom} ${JSON.stringify(hostileTracker.getRoom(tgtroom))}`)
      creep.say(`TGT:${tgtroom}`)
      return creep.travelTo(new RoomPosition(25, 25, tgtroom), {
        offroad: true,
        roomCallback: (room) => {
          let hostile = hostileTracker.getRoom(room)
          let skip = hostile.hostile && room !== tgtroom || false
          console.log(`cb ${room} ${skip ? 'HOSTILE' : 'SAFE'} ${JSON.stringify(hostile)}`)
          if (skip) return false
        }
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
