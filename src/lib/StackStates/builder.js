import C from '/include/constants'

export default {
  builder (target, cache = {}) {
    if (!cache.work) {
      cache.work = this.creep.getActiveBodyparts(WORK)
    }
    target = { x: 25, y: 25, roomName: target }
    let tgt = this.resolveTarget(target)
    if (this.creep.pos.roomName !== tgt.roomName) {
      this.push('moveToRoom', tgt)
      return this.runStack()
    }
    let { room, pos } = this.creep
    if (this.creep.carry.energy) {
      let sites = room.find(C.FIND_MY_CONSTRUCTION_SITES)
      if (!sites.length) return
      let site = pos.findClosestByRange(sites)
      let hitsMax = Math.ceil(this.creep.carry.energy / (cache.work * C.BUILD_POWER))
      this.push('repeat', hitsMax, 'build', site.id)
      this.push('moveInRange', site, 3)
      this.runStack()
    } else {
      let tgt = room.storage || room.containers.find(c => c.store.energy)
      if (tgt) {
        this.push('withdraw', tgt.id)
        this.push('moveNear', tgt.id)
        return this.runStack()
      }
    }
  }
}
