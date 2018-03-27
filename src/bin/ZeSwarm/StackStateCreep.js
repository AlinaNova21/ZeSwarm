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
    let creep = this.creep
    let status = this.spawn.getStatus(this.memory.spawnTicket)
    if (status.status === C.EPosisSpawnStatus.ERROR) {
      throw new Error(`Spawn ticket error: ${status.message}`)
    }
    if (!creep) {
      if (status.status === C.EPosisSpawnStatus.SPAWNED) {
        this.log.info(`Creep dead`)
        return this.kernel.killProcess(this.context.id)
      }
      return this.log.info(`Creep not ready ${status.status}`)// Still waiting on creep
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

  buildAt (type, target, opts = {}) {
    if (!opts.work) {
      opts.work = this.creep.getActiveBodyparts(C.WORK)
    }
    const tgt = this.resolveTarget(target)
    if (this.creep.carry.energy) {
      let [site] = tgt.lookFor(C.LOOK_CONSTRUCTION_SITES)
      if (!site) {
        let [struct] = tgt.lookFor(C.LOOK_STRUCTURES, {
          filter: (s) => s.structureType === type
        })
        if (struct) { // Structure exists/was completed
          this.pop()
          return this.runStack()
        }
        this.creep.say('CSITE')
        return tgt.createConstructionSite(type)
      }
      let hitsMax = Math.ceil(sum(values(this.creep.carry)) / (opts.work * C.BUILD_POWER))
      this.push('repeat', hitsMax, 'build', site.id)
      this.runStack()
    } else {
      if (opts.energyState) {
        this.push(...opts.energyState)
        this.runStack()
      } else {
        this.creep.say('T:BLD GTHR')
        this.pop()
      }
    }
  }

  store (res) {
    if (this.creep.carry[res] === 0) {
      this.pop()
      return this.runStack()
    }
    let tgt = this.creep.room.storage || this.creep.room.spawns.find(s => s.energy < s.energyCapacity)
    if (tgt) {
      this.push('transfer', tgt.id, res)
      this.push('moveNear', tgt.id)
      return this.runStack()
    }
  }
}
