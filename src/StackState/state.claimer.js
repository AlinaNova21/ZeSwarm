const C = require('@/constants')

module.exports = {
  claimRoom (roomName) {
    const { room } = this.creep
    if (room.name !== roomName) {
      this.push('moveToRoom', roomName)
      this.creep.say(`mv ${roomName}`)
      return this.runStack()
    }
    // this.creep.say('Claiming!')
    const { controller } = room
    Memory.rooms[room.name] = Memory.rooms[room.name] || {}
    Memory.rooms[room.name].donor = this.creep.memory.room
    if (!controller) throw new Error('Cannot claim room without controller!!!')
    const keep = []
    room.find(C.FIND_HOSTILE_STRUCTURES)
      .filter(s => !keep.includes(s.structureType))
      .forEach(s => s.destroy())

    if (controller.reservation) {
      this.push('attackController', controller.id)
      this.push('signControllerR', controller.id, 'Future ZeSwarm Nest')
    } else {
      this.push('claimController', controller.id)
      this.push('signControllerR', controller.id, 'For ZeSwarm!')
    }
    this.push('say', 'MINE!', true)
    if (!this.creep.pos.isNearTo(controller)) {
      this.push('moveNear', controller.id)
    }
    return this.runStack()
  }
}
