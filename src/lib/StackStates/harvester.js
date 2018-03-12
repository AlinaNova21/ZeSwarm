export default {
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
      let { x, y, roomName } = this.creep.pos
      let [{ structure: cont } = {}] = this.creep.room.lookForAtArea(C.LOOK_STRUCTURES, y - 1, x - 1, y + 1, x + 1, true)
        .filter(s => s.structure.structureType === C.STRUCTURE_CONTAINER)
      if (cont) {
        if (!this.pos.isEqual(cont.pos)) {
          this.push('travelTo', { x, y, roomName })
          return this.runStack()
        }
      } else {
        const fullHits = Math.floor(this.creep.carryCapacity / (cache.work * C.HARVEST_POWER))
        this.push('buildAt', C.STRUCTURE_CONTAINER, { x, y, roomName }, {
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
        this.push('moveNear', tgt.id)
      } else {
        this.push('sleep', Game.time + tgt.ticksToRegeneration)
      }
      this.runStack()
    }
  }
}
