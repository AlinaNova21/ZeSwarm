import C from '/include/constants'

export default {
  protector (target, cache = {}) {
    target = { x: 25, y: 25, roomName: target }
    let tgt = this.resolveTarget(target)
    if (this.creep.pos.roomName !== tgt.roomName) {
      this.push('moveToRoom', tgt)
      return this.runStack()
    }
    let { room, pos } = this.creep
    let hostiles = room.find(C.FIND_HOSTILE_CREEPS)
    let hostile = pos.findClosestByRange(hostiles)
    this.push('attack', hostile.id)
    this.push('moveNear', hostile.id)
    this.runStack()
  }
}
