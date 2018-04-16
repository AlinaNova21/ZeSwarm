export default {
  claimer (target, id) {
    let tgt = this.resolveTarget(target)
    if (id) {
      this.push('suicide')
      this.push('say', 'GOT IT!', true)
      this.push('claimController', id)
      this.push('say', 'MINE!', true)
      this.push('moveNear', tgt)
    } else {
      if (this.creep.pos.roomName !== tgt.roomName) {
        this.push('moveToRoom', tgt)
      } else {
        let { controller } = this.creep.room
        this.push('claimer',controller.pos, controller.id)
      }
    }
    this.runStack()
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
