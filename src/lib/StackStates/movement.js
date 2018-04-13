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
    let { path } = PathFinder.search(this.creep.pos, targets, { 
      flee: true,
      roomCallback (room) {
        let cm = new PathFinder.CostMatrix()
        for(let i = 0; i < 2500; i++) {
          cm._bits[i] = 0
        }
        let r = Game.rooms[room]
        if (r) {
          r.structures.all.forEach(({ structureType, pos: { x, y } }) => {
            if (OBSTACLE_OBJECT_TYPES.includes(structureType)) {
              cm.set(x,y,254)
            }
          })
        }
        return cm
      }
    })
    console.log(path,JSON.stringify(targets))
    if (path && path.length) {
      this.creep.moveByPath(path)
    }
    this.pop()
  }
}
