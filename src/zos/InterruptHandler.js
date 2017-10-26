export default class InterruptHandler {
  constructor (memget) {
    this.trackers = trackers
    this.memget = memget || (() => {
      Memory.interruptHandler = Memory.interruptHandler || {}
      return Memory.interruptHandler
    })
    this.memget().hooks = this.memget().hooks || {}
  }
  get memory () {
    return this.memget()
  }
  get hooks () {
    return this.memory.hooks
  }
  add (pid, type, stage, key) {
    let hkey = [type, stage, key, pid].join(':')
    this.hooks[hkey] = { type, stage, key, pid }
  }
  remove (pid, type, stage, key) {
    let hkey = [type, stage, key, pid].join(':')
    delete this.hooks[hkey]
  }
  run (stage = 'start') {
    let list = []
    let trackers = {}
    _.each(this.trackers, tracker => {
      if (tracker.stages.indexOf(stage) === -1) {
        return
      }
      trackers[tracker.type] = tracker.getEvents()
    })
    _.each(this.hooks, hook => {
      if (hook.stage !== stage) return
      if (!trackers[hook.type]) return
      _.each(trackers[hook.type], key => {
        if (!hook.key || hook.key === key) {
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
      return Object.keys(RawMemory.segments)
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
  }
]
