import C from '/constants'
// import log from '/log'

export default {
  hauler (fromRoom, fromId, toRoom, toId, resourceType = C.RESOURCE_ENERGY, cache = {}) {
    if (!this.creep.carryCapacity) {
      this.creep.say('No CARRY', true)
      this.push('suicide')
      return this.runStack()
    }
    const room = Game.rooms[this.creep.memory.room]
    if (this.creep.carry[resourceType]) {
      if (this.creep.pos.roomName === toRoom) {
        this.push('transfer', toId, resourceType)
        this.push('moveNear', toId)
      } else {
        this.push('moveToRoom', toRoom)
      }
    } else {
      if (this.creep.pos.roomName === fromRoom) {
        if (!Game.getObjectById(fromId)) {
          this.push('suicide')
          this.push('say', 'NoTgt')
          return this.runStack()
        }
        if (!resourceType) {
          resourceType = Object.keys(Game.getObjectById(fromId).store)[0]
          this.pop()
          this.push('hauler', fromRoom, fromId, toRoom, toId, resourceType, cache)
          return this.runStack()
        }
        this.push('withdraw', fromId, resourceType)
        this.push('moveNear', fromId)
      } else {
        this.push('moveToRoom', fromRoom)
      }
    }
    return this.runStack()
  }
}
