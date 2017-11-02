export const INT_STAGE = (function (Enum) {
  Enum[Enum['START'] = 1] = 'START'
  Enum[Enum['END'] = 2] = 'END'
  return Enum
})({})

export const INT_TYPE = (function (Enum) {
  Enum[Enum['VISION'] = 1] = 'VISION'
  Enum[Enum['SEGMENT'] = 2] = 'SEGMENT'
  Enum[Enum['CREEP'] = 3] = 'CREEP'
  Enum[Enum['TICK'] = 4] = 'TICK'
  Enum[Enum['SLEEP'] = 5] = 'SLEEP'
  return Enum
})({})

export const INT_FUNC = (function (Enum) {
  Enum[Enum['INTERRUPT'] = 1] = 'INTERRUPT'
  Enum[Enum['WAKE'] = 2] = 'WAKE'
  return Enum
})({})

export default class InterruptHandler {
  constructor (memget) {
    this.trackers = trackers
    this.memget = memget || (() => {
      Memory.interruptHandler = Memory.interruptHandler || {}
      return Memory.interruptHandler
    })
  }
  get memory () {
    return this.memget()
  }
  get hooks () {
    this.memory.hooks = this.memory.hooks || {}
    return this.memory.hooks
  }
  add (pid, type, stage, key, func = INT_FUNC.INTERRUPT) {
    if (typeof func === 'string' && INT_FUNC[func]) func = INT_FUNC[func]
    let hkey = [type, stage, key, pid].join(':')
    this.hooks[hkey] = { type, stage, key, pid, func }
  }
  remove (pid, type, stage, key) {
    let hkey = [type, stage, key, pid].join(':')
    delete this.hooks[hkey]
  }
  clear (pid) {
    // Not efficient, but shouldn't be called often
    let hkeys = Object.keys(this.hooks).filter(h => h.match(pid))
    hkeys.forEach(hkey => delete this.hooks[hkey])
  }
  run (stage = INT_STAGE.START) {
    let list = []
    let trackers = {}
    _.each(this.trackers, tracker => {
      if (tracker.stages.indexOf(stage) === -1) {
        return
      }
      trackers[tracker.type] = {
        keys: tracker.getEvents(),
        cond: tracker.cond || ((hook, key) => hook.key === key)
      }
    })
    _.each(this.hooks, hook => {
      if (hook.stage !== stage) return
      if (!trackers[hook.type]) return
      let { keys, cond } = trackers[hook.type]
      _.each(keys, key => {
        if (!hook.key || cond(hook, key)) {
          list.push([hook, key])
        }
      })
    })
    return list
  }
}

export const trackers = [
  {
    type: INT_TYPE.VISION,
    stages: [INT_STAGE.START],
    getEvents () {
      return Object.keys(Game.rooms)
    }
  },
  {
    type: INT_TYPE.SEGMENT,
    stages: [INT_STAGE.START],
    getEvents () {
      return Object.keys(RawMemory.segments).map(v => parseInt(v))
    }
  },
  {
    type: INT_TYPE.CREEP,
    stages: [INT_STAGE.START],
    getEvents () {
      return Object.keys(Game.creeps)
    }
  },
  {
    type: INT_TYPE.TICK,
    stages: [INT_STAGE.START, INT_STAGE.END],
    getEvents () {
      return [Game.time]
    }
  },
  {
    type: INT_TYPE.SLEEP,
    stages: [INT_STAGE.START, INT_STAGE.END],
    getEvents () {
      return [Game.time]
    },
    cond (hook, key) {
      return Game.time >= parseInt(hook.key)
    }
  }
]
