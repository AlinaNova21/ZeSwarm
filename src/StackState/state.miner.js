const C = require('/constants')
const log = require('/log')

module.exports = {
  miningWorker (target, cache = {}) {
    if (!cache.work) {
      cache.work = this.creep.getActiveBodyparts(C.WORK)
    }
    const remote = this.creep.memory.room !== this.creep.room.name
    const tgt = this.resolveTarget(target)
    if (!this.creep.pos.isNearTo(tgt)) {
      this.push('moveNear', target)
      return this.runStack()
    }
    if (tgt instanceof RoomPosition) {
      const s = this.creep.pos.findClosestByRange(FIND_SOURCES)
      this.pop()
      this.push('miningWorker', s.id, cache)
      return this.runStack()
    }
    if (!remote && _.sum(this.creep.carry) == this.creep.carryCapacity) {
      this.creep.say('full drpng')
      // return
    }
    if (tgt instanceof Source) {
      const cont = remote && this.creep.pos.findInRange(FIND_STRUCTURES, 3).find(o => o.structureType == C.STRUCTURE_CONTAINER)
      if (remote && !cont) {
        this.creep.say('no cont')
        const [csite] = this.creep.pos.findInRange(FIND_CONSTRUCTION_SITES, 3)
        if (!csite) {
          this.creep.say('no csite')
          this.creep.room.createConstructionSite(this.creep.pos, STRUCTURE_CONTAINER)
          return
        }
        if (!this.creep.pos.isEqualTo(csite.pos)) {
          this.creep.say('mv csite')
          this.push('moveTo', csite.pos)
          return this.runStack()
        }
        if (this.creep.carry.energy) {
          const cnt = Math.ceil(this.creep.carry.energy / (C.BUILD_POWER * cache.work))
          this.creep.say('bld csite')
          this.push('repeat', cnt, 'build', csite.id)
          this.runStack()
        } else {
          const cnt = Math.floor(this.creep.carryCapacity / (C.HARVEST_POWER * cache.work))
          this.creep.say('hrv csite')
          this.push('repeat', cnt, 'harvest', tgt.id)
          this.runStack()
        }
        return
      }
      if (cont && !this.creep.pos.isEqualTo(cont.pos)) {
        this.push('moveTo', cont.pos)
        return this.runStack()
      }      
      if (tgt.energy) {
        this.push('repeat', 5, 'harvest', tgt.id)
        this.push('repair', cont.id)
        this.push('moveNear', tgt.id)
      } else {
        this.push('sleep', Game.time + tgt.ticksToRegeneration)
      }
      this.runStack()
    }
  },
  miningCollector (target, wgroup, resourceType = C.RESOURCE_ENERGY, cache = {}) {
    const tgt = this.resolveTarget(target)
    if (!this.creep.carryCapacity) {
      this.creep.say('No CARRY', true)
      this.push('suicide')
      return this.runStack()
    }
    if (_.sum(_.values(this.creep.carry)) === this.creep.carryCapacity) {
      const room = Game.rooms[this.creep.memory.room]
      const spawn = room.spawns[0]
      const cont = room.controller.level >= 4 && room.storage || spawn.pos.findClosestByRange(room.containers)
      const tgt = cont || spawn
      const cap = tgt && (tgt.storeCapacity || tgt.energyCapacity) || 1
      const has = tgt && (tgt.energy || (tgt.store && tgt.store.energy)) || 0
      if (tgt && has === cap) {
        this.push('flee', [{ pos: tgt.pos, range: 4 }])
        return this.runStack()
      } else {
        this.push('transfer', tgt.id, C.RESOURCE_ENERGY)
        this.push('moveNear', tgt.id)
      }
      return this.runStack()
    }
    if (!this.creep.pos.inRangeTo(tgt, 2)) {
      this.push('moveInRange', target, 2)
      return this.runStack()
    }
    // let { x, y } = tgt.pos
    // let [{ resource: res } = {}] = this.creep.room.lookForAtArea(C.LOOK_RESOURCES, y - 1, x - 1, y + 1, x + 1, true)
    const [resource] = this.creep.pos.findInRange(FIND_DROPPED_RESOURCES, 4)
      .filter(r => r.resourceType === resourceType)
    if (resource) {
      this.push('pickup', resource.id)
      this.push('moveNear', resource.id)
      return this.runStack()
    }
    const remote = this.creep.memory.room !== this.creep.room.name
    const tombstone = this.creep.pos.findInRange(FIND_TOMBSTONES, 3).find(o => o.store[resourceType])
    if (tombstone) {
      this.push('withdraw', tombstone.id, resourceType)
      this.push('moveNear', tombstone.pos)
      return this.runStack()
    }
    const cont = this.creep.pos.findInRange(FIND_STRUCTURES, 4).find(o => o.structureType == C.STRUCTURE_CONTAINER)
    if (remote && !cont) return // Don't steal building energy
    if (cont && cont.store[resourceType] > 50) {
      this.push('withdraw', cont.id, resourceType)
      this.push('moveNear', cont.pos)
      return this.runStack()
    }
    let creeps = tgt.findInRange(C.FIND_MY_CREEPS, 4)
    creeps = creeps.filter(c => c.memory.group === wgroup && c.carry[resourceType] > 30)
    const creep = this.creep.pos.findClosestByRange(creeps)
    if (creep) {
      const vis = this.creep.room.visual
      vis.line(creep.pos, this.creep.pos, { color: 'red' })
      vis.circle(creep.pos, { radius: 0.5, stroke: 'red', strokeWidth: 0.2 })
      this.push('revTransfer', creep.id, resourceType)
      this.push('moveNear', creep.id)
      return this.runStack()
    } else {
      const [src] = this.creep.pos.findInRange(FIND_SOURCES, 4)
      if (src) {
        this.creep.say('No Miner')
        this.push('sleep', Game.time + 10)
        this.push('flee', [{ pos: src.pos, range: 6 }])
        return this.runStack()
      }
    }
    // this.push('sleep', Game.time + 5)
    // return this.runStack()
  }
}
