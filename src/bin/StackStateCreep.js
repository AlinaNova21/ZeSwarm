import C from '/include/constants'
import eachRight from 'lodash-es/eachRight'
import sum from 'lodash-es/sum'
import values from 'lodash-es/values'

export default class StackStateCreep {
  constructor (context) {
    this.context = context
    this.kernel = context.queryPosisInterface('baseKernel')
    this.spawn = context.queryPosisInterface('spawn')
  }

  get log () {
    return this.context.log
  }

  get memory () {
    return this.context.memory
  }

  get stack () {
    this.memory.stack = this.memory.stack || [this.memory.base || ['idle', 'No State']]
    return this.memory.stack
  }

  get creep () {
    return this.spawn.getCreep(this.memory.spawnTicket)
  }

  run () {
    let status = this.spawn.getStatus(this.memory.spawnTicket)
    if (status.status === C.EPosisSpawnStatus.ERROR) {
      throw new Error(`Spawn ticket error: ${status.message}`)
    }
    if (!this.creep) {
      if (status.status === C.EPosisSpawnStatus.SPAWNED) {
        this.log.info(`Creep dead`)
        return this.kernel.killProcess(this.context.id)
      }
      return this.log.info(`Creep not ready ${status.status}`)// Still waiting on creep
    }
    this.runStack()
  }

  runStack () {
    let [[name, ...args]] = this.stack.slice(-1) || []
    this.log.info(`runStack: ${name}`)
    if (this[name]) {
      this[name](...args)
    } else {
      this.log.error(`Invalid state ${name}`)
      this.kernel.killProcess(this.context.id)
    }
  }

  toString () {
    return `${this.memory.spawnTicket} ${this.stack.slice(-1)[0]}`
  }

  push (...arg) {
    this.stack.push(arg)
  }

  pop () {
    this.stack.pop()
  }

  idle (say = 'Idling') {
    this.say(say)
  }

  sleep (until = 0) {
    if (Game.time >= until) {
      this.pop()
      this.runStack()
    }
  }

  noop () {
    this.pop()
  }

  say (say, publ = false) {
    this.creep.say(say, publ)
    this.pop()
    this.runStack()
  }

  loop (states, count = 1) {
    this.pop()
    if (--count > 0) {
      this.push('loop', states, count)
    }
    eachRight(states, state => this.push(...state))
    this.runStack()
  }

  repeat (count, ...state) {
    this.pop()
    if (count > 0) {
      this.push('repeat', --count, ...state)
    }
    this.push(...state)
    this.runStack()
  }

  resolveTarget (tgt) {
    if (typeof tgt === 'string') {
      return Game.getObjectById(tgt)
    }
    if (tgt.x && tgt.y) {
      return new RoomPosition(tgt.x, tgt.y, tgt.roomName || tgt.room)
    }
    return tgt
  }

  moveNear (target) {
    let tgt = this.resolveTarget(target)
    if (this.creep.pos.isNearTo(tgt)) {
      this.pop()
      this.runStack()
    } else {
      this.creep.travelTo(tgt)
    }
  }

  moveInRange (target, range) {
    let tgt = this.resolveTarget(target)
    if (this.creep.pos.inRangeTo(tgt, range)) {
      this.pop()
      this.runStack()
    } else {
      this.creep.travelTo(tgt)
    }
  }

  build (type, target, opts = {}) {
    const tgt = this.resolveTarget(target)
    if (this.creep.carry.energy) {
      let [site] = tgt.lookFor(C.LOOK_CONSTRUCTION_SITES)
      if (!site) {
        let [struct] = tgt.lookFor(C.LOOK_STRUCTURES, {
          filter: (s) => s.structureType === type
        })
        if (struct) { // Structure exists/was completed
          this.pop()
          return this.runStack()
        }
        return tgt.createConstructionSite(type)
      }
      this.creep.build(site)
    } else {
      if (opts.energyState) {
	this.log.info(opts.energyState)
        this.push(...opts.energyState)
        this.runStack()
      } else {
        this.creep.say('T:BLD GTHR')
        this.pop()
      }
    }
  }

  harvest (target) {
    const tgt = this.resolveTarget(target)
    this.creep.harvest(tgt)
    this.pop()
  }

  repair (target) {
    const tgt = this.resolveTarget(target)
    this.creep.repair(tgt)
    this.pop()
  }

  harvester (target, type = 'source', cache = {}) {
    if (!cache.work) {
      cache.work = this.creep.getActiveBodyparts(WORK)
    }
    let tgt = this.resolveTarget(target)
    if (!this.creep.pos.isNearTo(tgt)) {
      this.push('moveNear', target)
      return this.runStack()
    }
    let wantContainer = this.creep.body.length >= 8
    if (wantContainer) {
      let [cont] = this.creep.pos.lookFor(C.LOOK_STRUCTURES, {
        filter: (s) => s.structureType === C.STRUCTURE_CONTAINER
      })
      let { x, y, roomName } = this.creep.pos
      if (!cont) {
        const fullHits = Math.floor(this.creep.carryCapacity / (cache.work * C.HARVEST_POWER))
        this.push('build', C.STRUCTURE_CONTAINER, { x, y, roomName }, {
          energyState: ['repeat', fullHits, 'harvest', tgt.id]
        })
        return this.runStack()
      }
      if ((cont.hitsMax - cont.hits) >= (cache.work * C.REPAIR_POWER)) {
        this.push('repair', cont.id)
        return this.runStack()
      }
    }
    if (type == 'source') {
      if (tgt.energy) {
        this.push('repeat', 5, 'harvest', tgt.id)
      } else {
        this.push('sleep', Game.time + tgt.ticksToRegeneration)
      }
      this.runStack()
    }
  }

  collector (target) {
    let tgt = this.resolveTarget(target)
    if (sum(values(this.creep.carry)) === this.creep.carryCapacity) {
      this.log.info(`store`)
      this.push('store', C.RESOURCE_ENERGY)
      return this.runStack()
    }
    if (!this.creep.pos.inRangeTo(tgt, 2)) {
      this.log.info(`moveInRange`)
      this.push('moveInRange', target, 2)
      return this.runStack()
    }
    let { x, y } = tgt.pos
    let raw
    let [{ resource: res } = {}] = raw = this.creep.room.lookForAtArea(C.LOOK_RESOURCES, y - 1, x - 1, y + 1, x + 1, true)
    if (res) {
      this.log.info(`pickup ${res.id}`)
      this.push('pickup', res.id)
      return this.runStack()
    }
    let [{ structure: cont } = {}] = this.creep.room.lookForAtArea(C.LOOK_STRUCTURES, y - 1, x - 1, y + 1, x + 1, true).filter(s => s.structure.structureType === 
C.STRUCTURE_CONTAINER)
    if (cont) {
      this.log.info(`withdraw ${cont.id}`)
      this.push('withdraw', cont.id, C.RESOURCE_ENERGY)
      return this.runStack()
    }
  }

  withdraw (target, res, amt) {
    let tgt = this.resolveTarget(target)
    if (!this.creep.pos.isNearTo(tgt)) {
      this.push('moveNear', target)
      return this.runStack()
    }
    this.creep.withdraw(tgt, res, amt)
    this.pop()
  }

  transfer (target, res, amt) {
    let tgt = this.resolveTarget(target)
    if (!this.creep.pos.isNearTo(tgt)) {
      this.push('moveNear', target)
      return this.runStack()
    }
    this.creep.transfer(tgt, res, amt)
    this.pop()
  }

  pickup (target) {
    let tgt = this.resolveTarget(target)
    if (!this.creep.pos.isNearTo(tgt)) {
      this.push('moveNear', target)
      return this.runStack()
    }
    this.creep.pickup(tgt)
    this.pop()
  }

  store (res) {
    if (this.creep.carry[res] === 0) {
      this.pop()
      return this.runStack()
    }
    let tgt = this.creep.room.storage
    if (tgt) {
      this.push('transfer', tgt.id, res)
      return this.runStack()
    }
    this.pop()
  }
}
/*
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
      tgt = creep.pos.findClosestByRange(targets)
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
*/
