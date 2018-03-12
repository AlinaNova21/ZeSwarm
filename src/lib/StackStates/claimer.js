export default {
  claimer (room) {
    if (this.creep.pos.roomName !== room) {
      this.push('moveToRoom', room)
      return this.runStack()
    }
    let controller = this.creep.room.controller
    if (controller) {
      this.push('suicide')
      this.push('say', 'Claimed', true)
      this.push('claimController', controller.id)
      this.push('say', 'MINE!', true)
      this.push('moveNear', controller.id)
      this.runStack()
    } else {
      this.say('WTF?!')
    }
  },
  moveToRoom (room) {
    if (this.creep.pos.roomName === room) {
      this.pop()
      this.runStack()
    } else {
      const tgt = new RoomPosition(25, 25, room)
      this.creep.travelTo(tgt)
    }
  }
}
