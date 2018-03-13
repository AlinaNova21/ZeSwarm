// import { posisInterface } from "../common"
import times from 'lodash-es/times'
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
    this.kernel = extensionRegistry.getExtension('kernel')
    this.mm = extensionRegistry.getExtension('memoryManager')
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
  get status () {
    if (this.memory === false) return {}
    this.memory.status = this.memory.status || {}
    return this.memory.status
  }
  UID () {
    return ('C' + Game.time.toString(36).slice(-4) + Math.random().toString(36).slice(-2)).toUpperCase()
  }
  // Queues/Spawns the creep and returns an ID
  spawnCreep ({ rooms, body, priority = 5 }) {
    priority = Math.min(Math.max(priority, 0), 9)
    let uid = this.UID()
    let item = {
      statusId: uid,
      rooms,
      body,
      priority,
      pid: this.kernel.currentId
    }
    this.queue[priority].push(item)
    this.status[uid] = {
      status: C.EPosisSpawnStatus.QUEUED
    }
    return uid
  }
  // Used to see if its been dropped from queue
  getStatus (id) {
    let stat = this.status[id] || { status: C.EPosisSpawnStatus.ERROR, message: "ID Doesn't Exist" }
    if (stat.status === C.EPosisSpawnStatus.SPAWNING && Game.creeps[id] && !Game.creeps[id].spawning) {
      stat.status = C.EPosisSpawnStatus.SPAWNED
    }
    return stat
  }
  getCreep (id) {
    let stat = this.getStatus(id)
    if (stat.status === C.EPosisSpawnStatus.SPAWNED) {
      return Game.creeps[stat.name || id]
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
