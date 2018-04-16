import C from '/include/constants'
import eachRight from 'lodash-es/eachRight'
import sum from 'lodash-es/sum'
import values from 'lodash-es/values'
import states from '/lib/StackStates/index'

export default class StackStateCreep extends states {
  constructor (context) {
    super()
    this.context = context
    this.kernel = context.queryPosisInterface('baseKernel')
    this.spawn = context.queryPosisInterface('spawn')
  }

  get log () {
    return this.context.log
  }

  get memory () {
    return this.context.memory
  }

  get stack () {
    this.memory.stack = this.memory.stack || []
    if (!(this.memory.stack instanceof Array)) {
      this.memory.stack = []
    }
    if (!this.memory.stack.length) {
      this.memory.stack = [this.memory.base || ['idle', 'No State']]
    }
    return this.memory.stack
  }

  get creep () {
    return this.spawn.getCreep(this.memory.spawnTicket)
  }

  run () {
    let start = Game.cpu.getUsed()
    let status = this.spawn.getStatus(this.memory.spawnTicket)
    if (status.status === C.EPosisSpawnStatus.ERROR) {
      throw new Error(`Spawn ticket error: ${status.message}`)
    }
    let creep = this.creep
    if (!creep) {
      if (status.status === C.EPosisSpawnStatus.SPAWNED) {
        this.log.info(`Creep dead`)
        return this.kernel.killProcess(this.context.id)
      }
      return // this.log.info(`Creep not ready ${status.status}`)// Still waiting on creep
    }
    try {
      this.runStack()
      // this.debug = true
      if (this.debug) {
        this.say(this.stack.slice(-1)[0])
      }
    } catch (e) {
      this.log.error(`Stack: ${this.stack.map(v => JSON.stringify(v)).join('->')}`)
      throw e
    }
    let end = Game.cpu.getUsed()
    if (creep) {
      creep.room.visual.text(Math.round((end - start) * 100) / 100, creep.pos.x + 1, creep.pos.y, { size: 0.6 })
    }
  }

  toString () {
    return `${this.memory.spawnTicket} ${this.stack.slice(-1)[0]}`
  }
}
