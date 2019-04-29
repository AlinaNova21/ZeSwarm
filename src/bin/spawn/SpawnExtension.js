// import { posisInterface } from "../common"
import times from 'lodash-es/times'
import each from 'lodash-es/each'
import C from '/include/constants'

// interface SpawnManagerMemory {
//   queue: SpawnQueueItem[][],
//   status: SpawnQueueStatus
// }

const PRIORITY_COUNT = 10

export default class SpawnExtension {
  get memory () {
    let mem = Memory.spawnSys = Memory.spawnSys || {}
    // this.mm.load(C.SEGMENTS.SPAWN)
    // if (mem !== false && (!mem.type === 'interrupt' || typeof mem === 'string')) {
    //   mem = { type: 'interrupt' }
    //   this.mm.save(C.SEGMENTS.INTERRUPT, mem)
    // }
    return mem
  }
  constructor (extensionRegistry) {
    if (!C.SEGMENTS.SPAWN) {
      C.addSegment('SPAWN')
    }
    this.extensionRegistry = extensionRegistry
    this.kernel = extensionRegistry.getExtension('zos/kernel')
    this.mm = extensionRegistry.getExtension('segments')
    this.interrupt = extensionRegistry.getExtension('interrupt')
    if (this.memory === false) {
      this.mm.activate(C.SEGMENTS.SPAWN)
    }
  }
  get queue () {
    if (this.memory === false) return []
    if (!this.memory.queue || this.memory.queue.length !== PRIORITY_COUNT) {
      this.memory.queue = times(PRIORITY_COUNT, () => [])
    }
    this.memory.queue = this.memory.queue || []
    return this.memory.queue
  }
  get queueLength () {
    let cnt = 0
    for(const queue of this.queue) {
      cnt += queue.length
    }
    return cnt
  }
  get status () {
    if (this.memory === false) return {}
    this.memory.status = this.memory.status || {}
    return this.memory.status
  }
  UID () {
    return ('C' + Game.time.toString(36).slice(-4) + Math.random().toString(36).slice(-2)).toUpperCase()
  }
  // Queues/Spawns the creep and returns an ID
  spawnCreep ({ rooms, body, priority = 5, maxRange = 10 }) {
    priority = Math.min(Math.max(priority, 0), 9)
    let bodies = body.map(b => b.join())
    let orphans = this.getOrphans(rooms)
    for (let i in bodies) {
      let body = bodies[i]
      const [orphan] = orphans[body] || []
      if (orphan) {
        this.status[orphan] = {
          name: orphan,
          status: C.EPosisSpawnStatus.SPAWNING,
          lastAccess: Game.time
        }
        console.log(`Orphan returned ${orphan}`)
        this.getCreep(orphan)
        return orphan
      }
    }
    let uid = this.UID()
    let item = {
      statusId: uid,
      rooms,
      body,
      priority,
      maxRange,
      pid: this.kernel.currentId
    }
    this.queue[priority].push(item)
    this.status[uid] = {
      status: C.EPosisSpawnStatus.QUEUED,
      lastAccess: Game.time
    }
    return uid
  }
  getOrphans (rooms) {
    let ret = {}
    // let stats = {}
    // each(this.status, (stat, id) => stats[stat.name || id] = stat)
    for (let id in Game.creeps) {
      const creep = Game.creeps[id]
      // const { lastAccess = 0, status } = stats[id]
      if (!creep.memory._p || !this.kernel.getProcessById(creep.memory._p)) {
        if (rooms && !rooms.includes(creep.pos.roomName)) continue
        const body = creep.body.map(b => b.type).join()
        ret[body] = ret[body] || []
        ret[body].push(id)
      }  
    }
    return ret
  }
  // Used to see if its been dropped from queue
  getStatus (id) {
    let stat = this.status[id] || { status: C.EPosisSpawnStatus.ERROR, message: `ID ${id} Doesn't Exist` }
    stat.lastAccess = Game.time
    if (stat.status === C.EPosisSpawnStatus.SPAWNING && Game.creeps[id] && !Game.creeps[id].spawning) {
      stat.status = C.EPosisSpawnStatus.SPAWNED
    }
    return stat
  }
  getCreep (id) {
    let stat = this.getStatus(id)
    if (stat.status !== C.EPosisSpawnStatus.QUEUED) {
      const creep = Game.creeps[stat.name || id]
      if (creep) {
        creep.memory._p = this.kernel.currentId
      }
      if (stat.status === C.EPosisSpawnStatus.SPAWNED) {
        return creep
      }
    }
  }
  waitForCreep (id) {
    let stat = this.getStatus(id)
    if (stat.status === C.EPosisSpawnStatus.SPAWNING) {
      // This WILL NOT WORK!
      this.interrupt.wait(C.INT_TYPE.CREEP, C.INT_STAGE.START, stat.name || id)
    }
  }
}
