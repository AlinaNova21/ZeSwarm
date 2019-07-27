const C = require('/constants')

module.exports = {
  claimRoom (roomName) {
    const { room } = this.creep
    if (room.name !== roomName) {
      this.push('moveToRoom', roomName)
      this.creep.say(`mv ${roomName}`)
      return this.runStack()
    }
    this.creep.say('Claiming!')
    const { controller } = room
    Memory.rooms[room.name] = Memory.rooms[room.name] || {}
    Memory.rooms[room.name].donor = this.creep.memory.room
    if (!controller) throw new Error('Cannot claim room without controller!!!')
    this.push('signController', controller.id, 'For ZeSwarm!')
    this.push('claimController', controller.id)
    this.push('say', 'MINE!', true)
    this.push('moveNear', controller.id)
    return this.runStack()
  }
}
