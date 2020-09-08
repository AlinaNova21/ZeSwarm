import { kernel, restartThread, sleep } from './kernel'
import segments from './MemoryManager'
import C from './constants'
import { Logger } from './log'

import groupBy from 'lodash/groupBy'
import sortBy from 'lodash/sortBy'

const log = new Logger('[Intel]')

const FORMAT_VERSION = 1

export class Intel {
  constructor () {
    kernel.createProcess('Intel', restartThread, this.main, this)
    // kernel.createThread('intelCollect', restartThread(() => this.collectThread()))
    // this.outdated = []
    // this.rooms = {}
    this.memory = {}
  }

  get outdated () {
    return this.memory.outdated || []
  }

  get rooms () {
    return this.memory.rooms || {}
  }

  * main (intel) {
    intel.memory = this.memory
    this.memory.intel = intel
    this.memory.outdated = []
    segments.activate(C.SEGMENTS.INTEL)
    yield
    this.memory.rooms = segments.load(C.SEGMENTS.INTEL)
    while (true) {
      if (!this.hasThread('collect')) {
        this.createThread('collect', intel.collectThread)
      }
      if (!this.hasThread('visual')) {
        this.createThread('visual', intel.visual)
      }
      yield * sleep(20)
    }
  }

  * visual () {
    yield
    yield
    while (true) {
      const rooms = Object.values(segments.load(C.SEGMENTS.INTEL).rooms || {})
      this.log.info(`Rendering ${rooms.length} rooms`)
      const fontStyle = {
        color: '#FFFFFF',
        fontSize: 5,
        align: 'left'
      }
      for (const room of rooms) {
        Game.map.visual.text(`S: ${room.sources.length}`, new RoomPosition(0, 0, room.name), fontStyle)
        Game.map.visual.text(`T: ${room.towers || 0}`, new RoomPosition(0, 5, room.name), fontStyle)
      }
      this.log.warn(Game.map.visual.getSize())
      yield
    }
  }

  findTarget () {
    const mem = segments.load(C.SEGMENTS.INTEL) || {}
    const sorted = sortBy(mem.rooms, r => {
      if (r.ts < Game.time - 5000) return 0 // We want rooms with recent intel
      if (r.towers.length) return 0 // Can't fight towers, yet
      if (r.safemode) return 0 // Ignore safemode
      let score = 0
      if (r.reserver) score += 1
      if (r.level) score += r.level
      return score
    })
    return sorted[0]
  }

  * collect (roomName) {
    const room = Game.rooms[roomName]
    if (!room) return
    const mem = segments.load(C.SEGMENTS.INTEL) || {}
    const hr = mem.rooms = mem.rooms || {}
    const {
      name,
      controller: {
        id,
        level,
        pos: { x, y } = {},
        my,
        safeMode,
        owner: { username: owner } = {},
        reservation: { username: reserver } = {}
      } = {}
    } = room
    if (hr[name] && hr[name].ts > Game.time - 10) return // Don't recollect immediately
    const [mineral] = room.find(C.FIND_MINERALS)
    const { mineralType } = mineral || {}
    const smap = ({ id, pos: { x, y } }) => ({ id, pos: [x, y] })
    const cmap = ({ id, pos: { x, y }, body, hits, hitsMax, my, owner: { username } }) => {
      const parts = groupBy(body, 'type')
      body = {}
      for (const [type, items] of Object.entries(parts)) {
        body[type] = items.length
      }
      return { id, pos: [x, y], body, hits, hitsMax, my: my || undefined, username, hostile: !my || undefined }
    }
    hr[room.name] = {
      hostile: (level && !my) || undefined,
      name,
      level: level || undefined,
      owner,
      reserver,
      spawns: room.spawns.length || undefined,
      towers: room.towers.length || undefined,
      drained: room.towers.reduce((l, v) => l + (v.energy / v.energyCapacity), 0) < (room.towers.length / 2) || undefined,
      walls: room.constructedWalls.length || undefined,
      ramparts: room.ramparts.length || undefined,
      creeps: room.find(C.FIND_HOSTILE_CREEPS).map(cmap),
      safemode: safeMode || undefined,
      controller: id && { id, pos: [x, y] },
      sources: room.find(C.FIND_SOURCES).map(smap),
      mineral: mineralType,
      ts: Game.time,
      v: FORMAT_VERSION
    }
    segments.save(C.SEGMENTS.INTEL, mem)
  }

  * collectThread () {
    segments.activate(C.SEGMENTS.INTEL)
    while (true) {
      const mem = segments.load(C.SEGMENTS.INTEL) || {}
      this.memory.rooms = mem.rooms || {}
      const rooms = Object.keys(Game.rooms)
      log.info(`Collecting intel on ${rooms.length} rooms (${rooms}) Outdated Rooms: ${this.memory.outdated.length}/${Object.keys(this.memory.rooms).length}`)
      for (const key in Game.rooms) {
        if (!this.hasThread(key)) {
          this.createThread(key, this.memory.intel.collect, key)
        }
      }
      const outdated = []
      for (const key in mem.rooms) {
        if (mem.rooms[key].ts < Game.time - 40000) {
          delete mem.rooms[key]
          continue
        }
        if (mem.rooms[key].ts < Game.time - 5000 || mem.rooms[key].v !== FORMAT_VERSION) {
          outdated.push(key)
        }
        yield true
      }
      this.memory.outdated = outdated
      segments.save(C.SEGMENTS.INTEL, mem)
      yield
    }
  }
}

export default new Intel()
