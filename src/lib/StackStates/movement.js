import C from '/include/constants'

export default {
  travelTo (target, opts = {}) {
    if (typeof opts.roomCallback === 'string') {
      opts.roomCallback = new Function(opts.roomCallback)
    }
    const tgt = this.resolveTarget(target)
    if (this.creep.pos.isEqualTo(tgt)) {
      this.pop()
      this.runStack()
    } else {
      this.creep.travelTo(tgt, opts)
    }
  },
  moveNear (target, opts = {}) {
    if (typeof opts.roomCallback === 'string') {
      opts.roomCallback = new Function(opts.roomCallback)
    }
    let tgt = this.resolveTarget(target)
    if (this.creep.pos.isNearTo(tgt)) {
      this.pop()
      this.runStack()
    } else {
      this.creep.travelTo(tgt, opts)
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
  },
  flee (targets) {
    let { path } = PathFinder.search(this.creep.pos, targets, { flee: true })
    if (path) {
      this.creep.moveByPath(path)
    }
    this.pop()
  }
}
