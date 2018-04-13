import each from 'lodash-es/each'
import C from '/include/constants'
import BaseProcess from './BaseProcess'

export default class HarvestManager extends BaseProcess {
  constructor (context) {
    super(context)
    this.context = context
    this.spawner = this.context.queryPosisInterface('spawn')
    this.kernel = this.context.queryPosisInterface('baseKernel')
    this.sleeper = this.context.queryPosisInterface('sleep')
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
    this.sleeper.sleep(5)
    if (!this.room) {
      this.log.warn(`No vision in ${this.memory.room}`)
      return
    }
    let sources = this.room.find(C.FIND_SOURCES)
    let minerals = this.room.find(C.FIND_MINERALS)
    let single = this.room.level > 2
    let creeps = [{
      cid: `harv`,
      state: 'harvester',
      body: [
        this.expand([1, C.CARRY, 6, C.WORK, 6, C.MOVE]),
        this.expand([1, C.CARRY, 5, C.WORK, 5, C.MOVE]),
        this.expand([1, C.CARRY, 4, C.WORK, 4, C.MOVE]),
        this.expand([1, C.CARRY, 3, C.WORK, 3, C.MOVE]),
        this.expand([1, C.CARRY, 2, C.WORK, 2, C.MOVE]),
        this.expand([1, C.CARRY, 1, C.WORK, 1, C.MOVE])
      ]
    },
    {
      cid: `coll`,
      state: 'collector',
      body: [
        this.expand([6, C.CARRY, 6, C.MOVE]),
        this.expand([5, C.CARRY, 5, C.MOVE]),
        this.expand([4, C.CARRY, 4, C.MOVE]),
        this.expand([3, C.CARRY, 3, C.MOVE]),
        this.expand([2, C.CARRY, 2, C.MOVE]),
        this.expand([1, C.CARRY, 1, C.MOVE])
      ]
    }]
    each(sources, source => {
      each(creeps, ({ cid, body, state }) => {
        let id = `${source.id}_${cid}`
        let spawnTicket = this.ensureCreep(id, {
          rooms: [this.memory.room],
          body,
          priority: 1
        })
        let base = [state, source.id]
        let proc = this.ensureChild(id, 'ZeSwarm/stackStateCreep', { spawnTicket, base })
      })
    })
    if (CONTROLLER_STRUCTURES[C.STRUCTURE_EXTRACTOR][this.room.level]) {      
      each(minerals, mineral => {
        let [extractor] = mineral.pos.lookFor(C.LOOK_STRUCTURES)
        if (!extractor) {
          let [csite] = mineral.pos.lookFor(C.LOOK_CONSTRUCTION_SITES)
          if (!csite) {
            csite = mineral.pos.createConstructionSite(C.STRUCTURE_EXTRACTOR)
          }
          return
        }
        {
          let spawnTicket = this.ensureCreep(`${mineral.id}_harv`, {
            rooms: [this.memory.room],
            body: [
              this.expand([49, C.WORK, 1, C.MOVE]),
              this.expand([40, C.WORK, 1, C.MOVE]),
              this.expand([30, C.WORK, 1, C.MOVE]),
              this.expand([25, C.WORK, 1, C.MOVE]),
              this.expand([20, C.WORK, 1, C.MOVE]),
              this.expand([15, C.WORK, 1, C.MOVE]),
              this.expand([10, C.WORK, 1, C.MOVE]),
            ],
            priority: 8,
            maxRange: 1
          })
          this.ensureChild(spawnTicket, 'ZeSwarm/stackStateCreep', { spawnTicket, base: ['harvester', mineral.id] })
        }
        {
          let spawnTicket = this.ensureCreep(`${mineral.id}_coll_1`, {
            rooms: [this.memory.room],
            body: [
              this.expand([8, C.CARRY, 8, C.MOVE]),
            ],
            priority: 8,
            maxRange: 1
          })
          this.ensureChild(spawnTicket, 'ZeSwarm/stackStateCreep', { spawnTicket, base: ['collector', mineral.id, mineral.mineralType] })
        }
      })
    }
  }
  toString () {
    return this.memory.room
  }
}
