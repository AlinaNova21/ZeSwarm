import each from 'lodash-es/each'
import C from '/include/constants'

class SpawnTest {
  constructor (context) {
    this.context = context
    this.spawner = this.context.queryPosisInterface('spawn')
    this.kernel = this.context.queryPosisInterface('baseKernel')
    this.sleeper = this.context.queryPosisInterface('sleep')
  }

  get log () {
    return this.context.log
  }

  get creeps () {
    this.context.memory.creeps = this.context.memory.creeps || []
    return this.context.memory.creeps
  }

  get children () {
    this.context.memory.children = this.context.memory.children || {}
    return this.context.memory.children
  }

  run () {
    // this.sleeper.sleep(3)
    this.context.memory.lastRun = Game.time
    if (this.creeps.length < 1) {
      let id = this.spawner.spawnCreep({ rooms: [this.context.memory.room], body: [[C.MOVE]] })
      this.creeps.push(id)
    }
    let rem = []
    this.log.info(JSON.stringify(this.creeps))
    each(this.creeps, (id, ind) => {
      let s = this.spawner.getStatus(id)
      if (s) {
        let c = this.spawner.getCreep(id)
        if (s.status === C.EPosisSpawnStatus.SPAWNED && !c) {
          rem.push(ind)
        }
        this.log.info(`Creep ${id} spawned ${this.children[id]}`)
        if (!this.children[id] || !this.kernel.getProcessById(this.children[id])) {
          // let { pid, process } = this.kernel.startProcess('ags131/SpawnTestCreep', { id })
          this.log.info(`Spawning process for ${id}`)
          let { pid, process } = this.kernel.startProcess('stackStateCreep', { spawnTicket: id })
          process.push('loop', [['say', `ID:${id}`], ['noop']], Infinity)
          process.push('noop')
          process.push('say', 'Arrived!')
          process.push('moveNear', { x: 23, y: 25, roomName: 'E1N19' })
          this.children[id] = pid
        }
      }
    })
    while (rem.length) {
      let ind = rem.pop()
      this.creeps.splice(ind, 1)
    }
  }
}

class SpawnTestCreep {
  constructor (context) {
    this.kernel = context.queryPosisInterface('baseKernel')
    this.spawner = context.queryPosisInterface('spawn')
  }

  run () {
    let creep = this.spawner.getCreep(this.context.memory.id)
    if (!creep) {
      this.kernel.killProcess(this.context.id)
      return
    }
    creep.move(Math.ceil(Math.random() * 8))
    creep.say(this.context.memory.id)
  }
}

export const bundle = {
  install (processRegistry) {
    processRegistry.register('ags131/SpawnTest', SpawnTest)
    processRegistry.register('ags131/SpawnTestCreep', SpawnTestCreep)
  }
}
