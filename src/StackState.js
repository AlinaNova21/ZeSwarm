const log = require('./log')

module.exports = {
  ...require('./state.core'),
  ...require('./state.scout'),
  ...require('./state.worker'),
  ...require('./state.builder'),
  get log() {
    return log
  },
  get stack() {
    return this.creep.memory.stack
  },
  runCreep(creep, baseState = ['scout']) {
    creep.memory.stack = creep.memory.stack || [baseState]
    this.creep = creep
    this.runStack()
  },
  say (say, publ = false) {
    this.creep.say(say, publ)
    this.pop()
    this.runStack()
  },
  suicide () {
    this.creep.suicide()
    this.pop()
  },
  move (dir) {
    this.creep.move(dir)
    this.pop()
  },
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
    
    if (!tgt || this.creep.pos.inRangeTo(tgt, range)) {
      this.pop()
      this.runStack()
    } else {
      this.creep.travelTo(tgt)
    }
  },
  moveToRoom (target) {
    if (typeof target === 'string' && target.match(/^[EW]\d+[NS]\d+$/)) {
      target = { x: 25, y: 25, roomName: target }
    }
    let tgt = this.resolveTarget(target)
    if (this.creep.pos.roomName === tgt.roomName) {
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
    if (path && path.length) {
      this.creep.moveByPath(path)
    }
    this.pop()
  }
}

const funcsToWrap = ['attack','rangedAttack','heal','upgradeController','claimController','attackController','signController','moveTo','build','harvest','repair', 'pickup', 'withdraw', 'transfer']
funcsToWrap.forEach(wrap)

function wrap(func) {
  module.exports[func] = function(target, ...args) {
    const tgt = this.resolveTarget(target)
    const fn = this.creep[func]
    fn.call(this.creep, tgt, ...args)
    this.pop()
  }
  module.exports[func+'R'] = function(target, ...args) {
    const tgt = this.resolveTarget(target)
    const fn = this.creep[func]
    fn.call(this.creep, tgt, ...args)
    this.pop()
    this.runStack()
  }
}
