const C = require('./constants')
const census = require('./census')

module.exports = {
  get hostileRooms () {
    Memory.hostileRooms = Memory.hostileRooms || {}
    return Memory.hostileRooms
  },
  get firstHostile () {
    let rooms = Object.keys(this.hostileRooms)
    return this.hostileRooms[rooms[0]]
  },
  run (creep, fullMode = 'upgrade', emptyMode = 'gather', allowAlt = true) {
    this.fullMode = fullMode
    this.emptyMode = emptyMode
    this.allowAlt = allowAlt
    if (creep.carry.energy === 0 && creep.carryCapacity) creep.memory.mode = emptyMode
    return this.exec(creep)
  },
  exec (creep) {
    return this[creep.memory.mode || this.fullMode](creep)
  },
  harvest (creep) {
    creep.memory.mode = 'gather'
    this.gather(creep)
  },
  gather (creep) {
    if (creep.carry.energy === creep.carryCapacity) creep.memory.mode = this.fullMode
    creep.memory.tgt = false
    if (!creep.memory.source) {
      creep.room.memory.sourceInd = creep.room.memory.sourceInd || 0
      let sources = creep.room.find(C.FIND_SOURCES_ACTIVE)
      let ind = creep.room.memory.sourceInd++ % sources.length
      if (!sources[ind]) {
        console.log('Source error', ind, sources, sources.length)
        return
      }
      creep.memory.source = sources[ind].id // sources[Math.floor(Math.random() * sources.length)].id
    }
    let tgt = Game.getObjectById(creep.memory.source)
    if (creep.pos.isNearTo(tgt)) {
      let cont = creep.pos.lookFor(C.LOOK_STRUCTURES).find(s => s.structureType === C.STRUCTURE_CONTAINER && s.store.energy)
      if (cont) {
        creep.withdraw(cont, C.RESOURCE_ENERGY)
      } else {
        creep.harvest(tgt)
      }
    } else {
      creep.travelTo(tgt)
    }
  },
  upgrade (creep) {
    let controller = creep.room.controller
    if (creep.pos.inRangeTo(controller, 3)) {
      creep.upgradeController(controller)
    } else {
      creep.travelTo(controller)
    }
  },
  build (creep) {
    let tgt = Game.getObjectById(creep.memory.tgt) || creep.room.controller.pos.findClosestByRange(C.FIND_MY_CONSTRUCTION_SITES)
    if (!tgt) {
      let damaged = creep.room.structures.all.filter(s => s.hits < s.hitsMax)
      let needsRepair = damaged.filter(s => s.hits / s.hitsMax < 0.75)
      if (needsRepair.length) {
        tgt = creep.pos.findClosestByRange(needsRepair)
      }
    }
    creep.memory.tgt = (tgt && tgt.id) || false
    if (!tgt) tgt = creep.room.controller
    if (creep.pos.inRangeTo(tgt, 3)) {
      if (tgt.structureType === C.STRUCTURE_CONTROLLER) {
        creep.upgradeController(tgt)
      } else {
        creep.repair(tgt)
        let r = creep.build(tgt)
        if (r === C.ERR_RCL_NOT_ENOUGH) creep.memory.mode = 'upgrade'
      }
    } else {
      creep.travelTo(tgt)
    }
  },
  withdraw (creep) {
    if (creep.carry.energy === creep.carryCapacity) {
      creep.memory.mode = this.fullMode
      return this.exec(creep)
    }

    let tgt = Game.getObjectById(creep.memory.tgt)
    if (!tgt) {
      let targets = [
        ...(creep.room.structures[C.STRUCTURE_CONTAINER] || []),
        ...(creep.room.structures[C.STRUCTURE_STORAGE] || [])
      ]
      targets = targets.filter(t => (t.store && t.store.energy) || t.energy)
      tgt = creep.pos.findClosestByRange(targets)
      creep.memory.tgt = tgt && tgt.id
    }
    if (tgt) {
      if (creep.pos.isNearTo(tgt)) {
        creep.withdraw(tgt, C.RESOURCE_ENERGY)
        creep.memory.tgt = false
      } else {
        creep.travelTo(tgt)
      }
    } else if (this.allowAlt) {
      creep.memory.mode = 'gather'
      this.gather(creep)
    }
  },
  deposit (creep) {
    let tgt = Game.getObjectById(creep.memory.tgt)
    let n = false
    if (!tgt) {
      let targets = [
        ...(creep.room.structures[C.STRUCTURE_TOWER] || []),
        ...(creep.room.structures[C.STRUCTURE_EXTENSION] || []),
        ...(creep.room.structures[C.STRUCTURE_SPAWN] || []),
        ...(creep.room.structures[C.STRUCTURE_STORAGE] || []),
        ...(creep.room.structures[C.STRUCTURE_CONTAINER] || [])
      ]
      targets = targets.filter(t => (t.storeCapacity || t.energyCapacity || 50) - ((t.store && t.store.energy) || t.energy || 0))
      // tgt = creep.pos.findClosestByRange(targets)
      tgt = targets[0]
      creep.memory.tgt = tgt && tgt.id
      n |= !!tgt
    }
    if (tgt) {
      if (creep.pos.isNearTo(tgt)) {
        let r = creep.transfer(tgt, C.RESOURCE_ENERGY)
        if (!n && r !== C.OK) creep.memory.mode = 'build'
        creep.memory.tgt = false
      } else {
        creep.travelTo(tgt)
      }
    }
  },
  drainer (creep) {
    const { room, memory } = creep
    let drainers = census.rooms[memory.homeRoom].roles['drainer']
    if (memory.ready) {
      let lowest = drainers.reduce((l, v) => l.hits > v.hits ? v : l, { hits: 1000 })
      if (creep.pos.isNearTo(lowest)) {
        creep.heal(lowest)
      } else {
        creep.rangedHeal(lowest)
      }
      let h = this.firstHostile
      if (room.name !== h.name) {
        return creep.travelTo(new RoomPosition(25, 25, h.name))
      }
      let structures = _.groupBy(room.find(C.FIND_STRUCTURES), 'structureType')
      let energyInTowers = structures[C.STRUCTURE_TOWER].reduce((l, v) => l + v.energy, 0)
      if (energyInTowers < 20) {
        let tgt = creep.pos.findClosestByRange(structures[C.STRUCTURE_TOWER])
        let obst = creep.pos.findClosestByRange([...structures[C.STRUCTURE_WALL], ...structures[C.STRUCTURE_RAMPART]])
        if (creep.pos.isNearTo(obst)) {
          creep.dismantle(obst)
        }
        if (creep.pos.isNearTo(tgt)) {
          creep.dismantle(tgt)
        } else {
          creep.travelTo(tgt)
        }
      } else {
        let { x, y } = creep.pos
        if (x !== 0 && x !== 49 && y !== 0 && y !== 49) {
          let exits = room.find(C.FIND_EXITS)
          creep.travelTo(creep.pos.findClosestByRange(exits))
        }
      }
    } else {
      if (drainers && drainers.length === 6) {
        drainers.forEach(d => (d.memory.ready = true))
      }
    }
  },
  suicide (creep) {
    const { room, memory } = creep
    let h = this.firstHostile
    if (room.name !== h.name) {
      return creep.travelTo(new RoomPosition(25, 25, h.name))
    }
  }
}
