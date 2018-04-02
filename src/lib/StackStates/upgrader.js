import C from '/include/constants'

export default {
  upgrader (target, cache = {}) {
    if (!cache.work) {
      cache.work = this.creep.getActiveBodyparts(C.WORK)
    }
    target = { x: 25, y: 25, roomName: target }
    let tgt = this.resolveTarget(target)
    if (this.creep.pos.roomName !== tgt.roomName) {
      this.push('moveToRoom', tgt)
      return this.runStack()
    }
    let { room, pos } = this.creep
    if (this.creep.carry.energy) {
      let controller = room.controller
      let upCnt = Math.ceil(this.creep.carry.energy / cache.work)
      this.push('repeat', upCnt, 'upgradeController', controller.id)
      this.push('moveInRange', controller.id, 3)
      this.runStack()
    } else {
      let tgt = room.storage || room.containers.find(c => c.store.energy)
      if (tgt) {
        this.push('withdraw', tgt.id, C.RESOURCE_ENERGY)
        this.push('moveNear', tgt.id)
        return this.runStack()
      }
    }
  }
}
