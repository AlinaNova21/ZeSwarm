import C from '/include/constants'
import each from 'lodash-es/each'
// import C from '../include/constants'
import BaseProcess from './BaseProcess'

export default class Nest extends BaseProcess {
  constructor (context) {
    super(context)
    this.context = context
    this.kernel = context.queryPosisInterface('baseKernel')
    this.mm = context.queryPosisInterface('memoryManager')
  }

  get log () {
    return this.context.log
  }

  get memory () {
    return this.context.memory
  }

  get children () {
    this.memory.children = this.memory.children || {}
    return this.memory.children
  }

  get roomName () {
    return this.memory.room
  }

  get room () {
    return Game.rooms[this.roomName]
  }

  run () {
    if (!this.room || !this.room.controller || !this.room.controller.my) {
      this.log.warn(`Invalid nest, terminating. (${this.roomName},${JSON.stringify(this.memory)})`)
      this.kernel.killProcess(this.context.id)
    }
    this.sleep.sleep(5)
    const children = [['ZeSwarm/harvestManager', { room: this.roomName }]]
    each(children, ([child, context = {}]) => {
      this.ensureChild(child, child, context)
    })

    const feeders = 2
    for (let i = 0; i < feeders; i++) {
      const cid = this.ensureCreep(`feeder_${i}`, {
        rooms: [this.roomName],
        body: [
          this.expand([6, C.CARRY, 6, C.MOVE]),
          this.expand([5, C.CARRY, 5, C.MOVE]),
          this.expand([4, C.CARRY, 4, C.MOVE]),
          this.expand([3, C.CARRY, 3, C.MOVE]),
          this.expand([2, C.CARRY, 2, C.MOVE]),
          this.expand([1, C.CARRY, 1, C.MOVE])
        ],
        priority: 2
      })

      this.ensureChild(`feeder_${cid}`, 'ZeSwarm/stackStateCreep', {
        spawnTicket: cid,
        base: ['feeder', this.roomName]
      })
    }

    if (this.room.find(C.FIND_MY_CONSTRUCTION_SITES).length) {
      const cid = this.ensureCreep('builder_1', {
        rooms: [this.roomName],
        body: [
          this.expand([6, C.CARRY, 6, C.WORK, 6, C.MOVE]),
          this.expand([5, C.CARRY, 5, C.WORK, 5, C.MOVE]),
          this.expand([4, C.CARRY, 4, C.WORK, 4, C.MOVE]),
          this.expand([3, C.CARRY, 3, C.WORK, 3, C.MOVE]),
          this.expand([2, C.CARRY, 2, C.WORK, 2, C.MOVE]),
          this.expand([1, C.CARRY, 1, C.WORK, 1, C.MOVE])
        ],
        priority: 2
      })
      this.ensureChild(`builder_${cid}`, 'ZeSwarm/stackStateCreep', {
        spawnTicket: cid,
        base: ['builder', this.roomName]
      })
    }
    if (this.room.controller && this.room.controller.level && this.room.controller.level < 8) {
      let want = 0
      const stored = this.room.storage && this.room.storage.store.energy || false
      if (stored === false) {
        want = 1
      } else {
        if (stored > 10000) {
          want = Math.min(3, stored / 10000)
        }
      }
      for(let i = 0; i < want; i++) {
        const cid = this.ensureCreep(`upgrader_${i}`, {
          rooms: [this.roomName],
          body: [
            this.expand([6, C.CARRY, 6, C.WORK, 6, C.MOVE]),
            this.expand([5, C.CARRY, 5, C.WORK, 5, C.MOVE]),
            this.expand([4, C.CARRY, 4, C.WORK, 4, C.MOVE]),
            this.expand([3, C.CARRY, 3, C.WORK, 3, C.MOVE]),
            this.expand([2, C.CARRY, 2, C.WORK, 2, C.MOVE]),
            this.expand([1, C.CARRY, 1, C.WORK, 1, C.MOVE])
          ],
          priority: 7
        })
        this.ensureChild(`upgrader_${cid}`, 'ZeSwarm/stackStateCreep', {
          spawnTicket: cid,
          base: ['upgrader', this.roomName]
        })   
      }
    }
    const hostiles = this.room.find(C.FIND_HOSTILE_CREEPS)
    if (hostiles.length) {
      if (hostiles[0].owner.username === 'Invader') {
        const cid = this.ensureCreep('protector_1', {
          rooms: [this.roomName],
          body: [
            this.expand([2, C.ATTACK, 2, C.MOVE]),
            this.expand([1, C.ATTACK, 1, C.MOVE])
          ],
          priority: 0
        })
        this.ensureChild(`protector_${cid}`, 'ZeSwarm/stackStateCreep', {
          spawnTicket: cid,
          base: ['protector', this.roomName]
        })
      }
    }

    this.cleanChildren()
  }
  toString () {
    return `${this.roomName} ${this.room.level}/${this.room.controller.level}`
  }

  expand (body) {
    this.bodyCache = this.bodyCache || {}
    const cacheKey = body.join('')
    if (this.bodyCache[cacheKey]) {
      return this.bodyCache[cacheKey]
    }
    let cnt = 1
    const ret = this.bodyCache[cacheKey] = []
    for (let i in body) {
      const t = body[i]
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
}
