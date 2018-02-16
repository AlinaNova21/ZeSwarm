import each from 'lodash-es/each'
import C from '/include/constants'

class SpawnTest {
  constructor (context) {
    this.context = context
    this.spawner = this.context.queryPosisInterface('spawn')
    this.kernel = this.context.queryPosisInterface('baseKernel')
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
    this.sleeper.sleep(3)
    this.context.memory.lastRun = Game.time
    if (this.creeps.length < 5) {
      let id = this.spawner.spawnCreep({ rooms: [this.context.memory.room], body: [[C.MOVE]] })
      this.creeps.push(id)
    }
    let rem = []
    each(this.creeps, (id, ind) => {
      let s = this.spawner.getStatus(id)
      if (s.status === C.EPosisSpawnStatus.SPAWNED) {
        let c = this.spawner.getCreep(id)
        if (!c) return rem.push(ind)

        if (c && !this.children[id]) {
          let { pid, process } = this.kernel.startProcess('ags131/SpawnTestCreep', { id })
          process.run()
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
