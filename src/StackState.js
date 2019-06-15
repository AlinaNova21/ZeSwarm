const log = require('./log')

module.exports = {
  ...require('./state.core'),
  ...require('./state.scout'),
  ...require('./state.worker'),
  ...require('./state.builder'),
  ...require('./state.miner'),
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
    if (!tgt) return this.pop()
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
    if (!tgt) this.pop()
    if (this.creep.pos.isNearTo(tgt)) {
      this.pop()
      this.runStack()
    } else {
      this.creep.travelTo(tgt, opts)
    }
  },
  moveInRange(target, range, opts = {}) {
    let tgt = this.resolveTarget(target)
    
    if (!tgt || this.creep.pos.inRangeTo(tgt, range)) {
      this.pop()
      this.runStack()
    } else {
      this.creep.travelTo(tgt, opts)
    }
  },
  moveToRoom(target, opts = {}) {
    if (typeof target === 'string' && target.match(/^[EW]\d+[NS]\d+$/)) {
      target = { x: 25, y: 25, roomName: target }
    }
    let tgt = this.resolveTarget(target)
    if (this.creep.pos.roomName === tgt.roomName) {
      this.pop()
      this.runStack()
    } else {
      this.creep.travelTo(tgt, opts)
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
  },
  store(res, cache = {}) {
    if (!cache.work) {
      cache.work = this.creep.getActiveBodyparts(C.WORK)
    }
    if (!this.creep.carry[res]) {
      this.pop()
      return this.runStack()
    }
    if (cache.work) {
      const road = this.creep.pos.lookFor(C.LOOK_STRUCTURES).find(s => s.structureType === C.STRUCTURE_ROAD)
      if (road && road.hits <= road.hitsMax < 100) {
        this.creep.repair(road)
      }
      let cs = this.pos.lookFor(C.LOOK_CONSTRUCTION_SITES).find(s => s.structureType === C.STRUCTURE_ROAD)
      if (cs) {
        return this.build(cs)
      }
    }
    let tgt = this.creep.room.storage || this.creep.room.fakeStorage || (res === C.RESOURCE_ENERGY && this.creep.room.spawns.find(s => s.energy < s.energyCapacity))
    if (tgt) {
      this.push('transfer', tgt.id, res)
      this.push('moveNear', tgt.id)
      return this.runStack()
    }
  },
  revTransfer(target, res = RESOURCE_ENERGY, amt) {
    let tgt = this.resolveTarget(target)
    if (tgt) {
      tgt.transfer(this.creep, res, amt)
    }
    this.pop()
  }
}

const funcsToWrap = ['attack','rangedAttack','heal','upgradeController','claimController','attackController','signController','moveTo','build','harvest','repair', 'pickup', 'withdraw', 'transfer']
funcsToWrap.forEach(wrap)

function wrap(func) {
  module.exports[func] = function(target, ...args) {
    const tgt = this.resolveTarget(target)
    if (tgt) {
      const fn = this.creep[func]
      fn.call(this.creep, tgt, ...args)
    }
    this.pop()
  }
  module.exports[func+'R'] = function(target, ...args) {
    const tgt = this.resolveTarget(target)
    if (tgt) {
      const fn = this.creep[func]
      fn.call(this.creep, tgt, ...args)
    }
    this.pop()
    this.runStack()
  }
}
