import each from 'lodash-es/each'
import C from '/include/constants'

export default class HarvestManager {
  constructor (context) {
    this.context = context
    this.spawner = this.context.queryPosisInterface('spawn')
    this.kernel = this.context.queryPosisInterface('baseKernel')
    this.sleeper = this.context.queryPosisInterface('sleep')
  }

  get log () {
    return this.context.log
  }

  get memory () {
    return this.context.memory
  }

  get tracking () {
    this.memory.tracking = this.memory.tracking || {}
    return this.memory.tracking
  }

  get room () {
    return Game.rooms[this.memory.room]
  }

  expand (body) {
    let cnt = 1
    let ret = []
    for (let i in body) {
      let t = body[i]
      if (typeof t === 'number') {
        cnt = t
      } else {
        for (let ii = 0; ii < cnt; ii++) {
          ret.push(t)
        }
      }
    }
    return ret
  }

  run () {
    this.sleeper.sleep(3)
    if (!this.room) {
      this.log.warn(`No vision in ${this.memory.room}`)
      return
    }
    let sources = this.room.find(FIND_SOURCES)
    let single = this.room.level > 2
    each(sources, source => {
      let t = this.tracking[source.id] = this.tracking[source.id] || { process: null, creep: null }
      if (!t.creep) {
        t.creep = this.spawner.spawnCreep({
          rooms: [this.memory.room],
          body: [
            this.expand([1, C.CARRY, 6, C.WORK, 6, C.MOVE]),
            this.expand([1, C.CARRY, 5, C.WORK, 5, C.MOVE]),
            this.expand([1, C.CARRY, 4, C.WORK, 4, C.MOVE]),
            this.expand([1, C.CARRY, 3, C.WORK, 3, C.MOVE]),
            this.expand([1, C.CARRY, 2, C.WORK, 2, C.MOVE]),
            this.expand([1, C.CARRY, 1, C.WORK, 1, C.MOVE])
          ]
        })
        this.log.info(`Creep doesn't exist, spawning ${t.creep} for ${source.id}`)
        return
      }
      if (!t.process || !this.kernel.getProcessById(t.process)) {
        this.log.info(`Process doesn't exist, spawning for ${t.creep}`)
        let { pid, process } = this.kernel.startProcess('stackStateCreep', { spawnTicket: t.creep })
        process.push('harvester', source.id)
        t.process = pid
      }
    })
  }
}
