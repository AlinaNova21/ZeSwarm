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
  add (pid, type, stage, key, func = 'interrupt') {
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
  run (stage = 'start') {
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
    type: 'vision',
    stages: ['start'],
    getEvents () {
      return Object.keys(Game.rooms)
    }
  },
  {
    type: 'segment',
    stages: ['start'],
    getEvents () {
      return Object.keys(RawMemory.segments).map(v => parseInt(v))
    }
  },
  {
    type: 'creep',
    stages: ['start'],
    getEvents () {
      return Object.keys(Game.creeps)
    }
  },
  {
    type: 'tick',
    stages: ['start', 'end'],
    getEvents () {
      return [Game.time]
    }
  },
  {
    type: 'sleep',
    stages: ['start', 'end'],
    getEvents () {
      return [Game.time]
    },
    cond (hook, key) {
      return Game.time >= parseInt(hook.key)
    }
  }
]
