const C = require('./constants')

module.exports = {
  miningWorker(target, cache = {}) {
    if (!cache.work) {
      cache.work = this.creep.getActiveBodyparts(C.WORK)
    }
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
    if (_.sum(this.creep.carry) == this.creep.carryCapacity) {
      this.creep.say('Zzzz..')
      return
    }
    if (tgt instanceof Source) {
      if (tgt.energy) {
        this.push('repeat', 5, 'harvest', tgt.id)
        this.push('moveNear', tgt.id)
      } else {
        this.push('sleep', Game.time + tgt.ticksToRegeneration)
      }
      this.runStack()
    }
  },
  miningCollector(target, wgroup, resourceType = C.RESOURCE_ENERGY, cache = {}) {
    const tgt = this.resolveTarget(target)
    if (!this.creep.carryCapacity) {
      this.creep.say('No CARRY', true)
      this.push('suicide')
      return this.runStack()
    }
    if (_.sum(_.values(this.creep.carry)) === this.creep.carryCapacity) {
      const room = Game.rooms[this.creep.memory.home]
      const spawn = room.spawns[0]
      const cont = spawn.pos.findClosestByRange(room.containers)
      const tgt = cont || spawn
      if (cont && cont.store.energy === cont.storeCapacity) {
        this.push('flee', cont, 2)
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
    const resources = this.creep.room.lookNear(C.LOOK_RESOURCES, tgt)
      .filter(r => r.resourceType === resourceType)
    if (resources.length) {
      this.push('pickup', resources[0].id)
      this.push('moveNear', resources[0].id)
      return this.runStack()
    }
    let creeps = tgt.findInRange(C.FIND_MY_CREEPS, 2)
    console.log(creeps.map(c => c.memory.group === wgroup))
    creeps = creeps.filter(c => c.memory.group === wgroup && c.carry.energy > 10)
    console.log(creeps)
    const creep = this.creep.pos.findClosestByRange(creeps)
    if (creep) {
      const vis = this.creep.room.visual
      vis.line(creep.pos, this.creep.pos, { color: 'red' })
      vis.circle(creep.pos, { radius: 0.5, stroke: 'red', strokeWidth: 0.2 })
      this.push('revTransfer', creep.id, resourceType)
      this.push('moveNear', creep.id)
      return this.runStack()
    }
    // this.push('sleep', Game.time + 5)
    // return this.runStack()
  }
}