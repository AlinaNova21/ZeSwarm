export default {
  claimer (target) {
    let tgt = this.resolveTarget(target)
    if (this.creep.pos.roomName !== tgt.roomName) {
      this.push('moveToRoom', tgt)
      return this.runStack()
    }
    let controller = this.creep.room.controller
    if (controller) {
      this.push('suicide')
      this.push('say', 'GOT IT!', true)
      this.push('claimController', controller.id)
      this.push('say', 'MINE!', true)
      this.push('moveNear', controller.id)
      this.runStack()
    } else {
      this.say('WTF?!')
    }
  },
  moveToRoom (target) {
    let tgt = this.resolveTarget(target)
    if (this.creep.pos.roomName === tgt.roomName) {
      this.pop()
      this.runStack()
    } else {
      this.creep.travelTo(tgt)
    }
  }
}
