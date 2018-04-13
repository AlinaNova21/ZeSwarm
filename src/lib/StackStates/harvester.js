import C from '/include/constants'

export default {
  harvester (target, cache = {}) {
    if (!cache.work) {
      cache.work = this.creep.getActiveBodyparts(C.WORK)
    }
    let tgt = this.resolveTarget(target)
    if (!this.creep.pos.isNearTo(tgt)) {
      this.push('moveNear', target)
      return this.runStack()
    }
    let wantContainer = this.creep.body.length >= 8
    if (wantContainer) {
      let { x, y, roomName } = this.creep.pos
      let cont
      if (cache.cont) {
        cont = Game.getObjectById(cache.cont)
      } else {
        // let conts = this.creep.room.lookForAtArea(C.LOOK_STRUCTURES, y - 1, x - 1, y + 1, x + 1, true)
        let conts = this.creep.room.lookNear(C.LOOK_STRUCTURES, tgt.pos)
          .filter(s => s.structureType === C.STRUCTURE_CONTAINER)
        cont = this.creep.pos.findClosestByRange(conts)
      }
      if (cont) {
        cache.cont = cont.id
        if (!this.creep.pos.isEqualTo(cont.pos)) {
          this.push('travelTo', cont.id)
          return this.runStack()
        }
      } else {
        const fullHits = Math.floor(this.creep.carryCapacity / (cache.work * C.HARVEST_POWER))
        this.push('buildAt', C.STRUCTURE_CONTAINER, { x, y, roomName }, {
          energyState: ['repeat', fullHits, 'harvest', tgt.id]
        })
        return this.runStack()
      }
      if (this.creep.carry.energy >= cache.work &&
      (cont.hitsMax - cont.hits) >= (cache.work * C.REPAIR_POWER)) {
        this.push('repair', cont.id)
        return this.runStack()
      }
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
    if (tgt instanceof Mineral) {
      let [extractor] = tgt.pos.lookFor(C.LOOK_STRUCTURES)
      if (!extractor) {
        this.push('sleep', 5)
        this.say('No Extr')
      }
      if (extractor.cooldown) {
        this.push('sleep', Game.time + extractor.cooldown)
        return this.runStack()
      }
      if (tgt.mineralAmount) {
        this.push('sleep', C.EXTRACTOR_COOLDOWN)
        this.push('harvest', tgt.id)
        this.push('moveNear', tgt.id)
      } else {
        this.push('sleep', Game.time + tgt.ticksToRegeneration)
      }
      this.runStack()
    }
  }
}
