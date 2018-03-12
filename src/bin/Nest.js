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
    let children = [['harvestManager', { room: this.roomName }]]
    each(children, ([child, context = {}]) => {
      this.ensureChild(child, child, context)
    })

    let cid = this.ensureCreep('feeder_1', {
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
    let proc = this.ensureChild(`feeder_${cid}`, 'stackStateCreep', {
      spawnTicket: cid,
      base: ['feeder', this.roomName]
    })
    this.cleanChildren()
  }
  toString () {
    return `${this.roomName} ${this.room.level}/${this.room.controller.level}`
  }

  expand (body) {
    this.bodyCache = this.bodyCache || {}
    let cacheKey = body.join('')
    if (this.bodyCache[cacheKey]) {
      return this.bodyCache[cacheKey]
    }
    let cnt = 1
    let ret = this.bodyCache[cacheKey] = []
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
}
