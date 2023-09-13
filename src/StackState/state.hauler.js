const C = require('@/constants')
// import log from '@/log'

module.exports = {
  hauler (fromRoom, fromId, toRoom, toId, resourceType = C.RESOURCE_ENERGY, cache = {}) {
    if (!this.creep.carryCapacity) {
      this.creep.say('No CARRY', true)
      this.push('suicide')
      return this.runStack()
    }
    const room = Game.rooms[this.creep.memory.room]
    const { maxTripTime=0, tripStartTime=Game.time } = cache
    
    if (this.creep.carry[resourceType]) {
      if (this.creep.pos.roomName === toRoom) {
        this.push('transfer', toId, resourceType)
        this.push('moveNear', toId)
      } else {
        this.push('moveToRoom', toRoom, { maxOps: 3000, findRoute: false })
      }
    } else {
      cache.maxTripTime = Math.max(maxTripTime, Game.time - tripStartTime)
      cache.tripStartTime = Game.time
      if (this.creep.ticksToLive < maxTripTime) {
        this.push('suicide')
        this.push('say', 'OUTATIME', true)
        return this.runStack()
      }
      if (this.creep.pos.roomName === fromRoom) {
        if (!Game.getObjectById(fromId)) {
          this.push('suicide')
          this.push('say', 'NoTgt', true)
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
        this.push('moveToRoom', fromRoom, { maxOps: 3000, findRoute: false })
      }
    }
    return this.runStack()
  }
}
