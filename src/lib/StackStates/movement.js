import C from '/include/constants'

export default {
  travelTo (target, opts = {}) {
    const tgt = this.resolveTarget(target)
    if (this.creep.pos.isEqual(tgt.pos || tgt)) {
      this.pop()
      this.runStack()
    } else {
      this.creep.travelTo(tgt, opts)
    }
  },
  moveNear (target) {
    let tgt = this.resolveTarget(target)
    if (this.creep.pos.isNearTo(tgt)) {
      this.pop()
      this.runStack()
    } else {
      this.creep.travelTo(tgt)
    }
  },
  moveInRange (target, range) {
    let tgt = this.resolveTarget(target)
    if (this.creep.pos.inRangeTo(tgt, range)) {
      this.pop()
      this.runStack()
    } else {
      this.creep.travelTo(tgt)
    }
  }
}
