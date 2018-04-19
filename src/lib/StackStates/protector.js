import C from '/include/constants'
import IFF from '/lib/IFF'

export default {
  protector (target, cache = {}) {
    target = { x: 25, y: 25, roomName: target }
    const tgt = this.resolveTarget(target)
    if (this.creep.pos.roomName !== tgt.roomName) {
      this.push('moveToRoom', tgt)
      return this.runStack()
    }
    const { room, pos } = this.creep
    const hostiles = room.find(C.FIND_HOSTILE_CREEPS).filter(IFF.notFriend)
    const hostile = pos.findClosestByRange(hostiles)
    this.push('attack', hostile.id)
    this.push('moveNear', hostile.id)
    this.runStack()
  }
}
