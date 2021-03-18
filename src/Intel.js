import { kernel, restartThread, sleep, Process } from './kernel'
import segments from './MemoryManager'
import C from './constants'
import { Logger } from './log'

import groupBy from 'lodash/groupBy'
import sortBy from 'lodash/sortBy'

const log = new Logger('[Intel]')

const FORMAT_VERSION = 1

export class Intel extends Process {
  constructor () {
    super(kernel, 'Intel')
    kernel.addProcess('Intel', this)
    // this.outdated = []
    // this.rooms = {}
    this.createThread('main', this.main)
  }

  get outdated () {
    return this.memory.outdated || []
  }

  get rooms () {
    return this.memory.rooms || {}
  }

  * main () {
    this.memory.outdated = []
    // segments.activate(C.SEGMENTS.INTEL)
    yield
    // if (!Memory.intel) {
    //   Memory.intel = segments.load(C.SEGMENTS.INTEL)
    // }
    if (!Memory.intel) {
      Memory.intel = {}
    }
    this.memory.rooms = Memory.intel
    while (true) {
      if (!this.hasThread('collect')) {
        this.createThread('collect', this.process.collectThread)
      }
      if (!this.hasThread('visual')) {
        this.createThread('visual', this.process.visual)
      }
      yield * sleep(20)
    }
  }

  * visual () {
    yield
    yield
    while (true) {
      const rooms = Object.values(Memory.intel.rooms)
      this.log.info(`Rendering ${rooms.length} rooms`)
      const fontStyle = {
        color: '#FFFFFF',
        fontSize: 5,
        align: 'left'
      }
      for (const room of rooms) {
        let y = 0
        const line = txt => Game.map.visual.text(txt, new RoomPosition(3, (y++ * fontStyle.fontSize) + (fontStyle.fontSize / 2), room.name), fontStyle)
        line(`S: ${room.sources && room.sources.length || 0}`)
        line(`T: ${room.towers || 0}`)
        line(`SC: ${room.symbolContainers && room.symbolContainers.length || 0}`)
        line(`A: ${Game.time - room.ts}`)
        // Game.map.visual.text(`SC: ${room.scoreCollectors.length} || 0}`, new RoomPosition(2, 12, room.name), fontStyle)
      }
      for (const room in Game.rooms) {
        Game.map.visual.text('👁️', new RoomPosition(25, 25, room), {
          color: '#FFFFFF',
          fontSize: 10,
          align: 'center'
        })
      }
      this.log.warn(`VisualSize: ${Game.map.visual.getSize()}`)
      yield
    }
  }

  findTarget () {
    const sorted = sortBy(this.rooms, r => {
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
    const mem = Memory.intel || {}
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
    const extra = {}
    const objects = room.find(C.FIND_STRUCTURES)
    const invaderCore = objects.find(o => o.structureType === C.STRUCTURE_INVADER_CORE)
    if (invaderCore) {
      extra.invaderCore = {
        ...smap(invaderCore),
        level: invaderCore.level
      }
    }
    if (C.FIND_SCORE_CONTAINERS) {
      extra.scoreContainers = room.find(C.FIND_SCORE_CONTAINERS).map(({ id, pos: { x, y }, decayTime }) => ({ id, pos: [x, y], decayTime }))
    }
    if (C.FIND_SCORE_COLLECTORS) {
      extra.scoreCollectors = room.find(C.FIND_SCORE_COLLECTORS).map(({ id, pos: { x, y } }) => ({ id, pos: [x, y] }))
    }
    if (C.FIND_SYMBOL_CONTAINERS) {
      extra.symbolContainers = room.find(C.FIND_SYMBOL_CONTAINERS).map(({ id, pos: { x, y }, resourceType, store: { [resourceType]: amount }, ticksToDecay }) => ({ id, pos: [x, y], resourceType, amount, decayTime: Game.time + ticksToDecay }))
    }
    if (C.FIND_SYMBOL_DECODERS) {
      extra.symbolDecoders = room.find(C.FIND_SYMBOL_DECODERS).map(({ id, pos: { x, y }, resourceType }) => ({ id, pos: [x, y], resourceType }))
    }
    hr[room.name] = {
      hostile: (level && !my) || undefined,
      name,
      level: (invaderCore && invaderCore.level) || level || undefined,
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
      v: FORMAT_VERSION,
      ...extra
    }
    // segments.save(C.SEGMENTS.INTEL, mem)
    Memory.intel = mem
  }

  * collectThread () {
    while (true) {
      const mem = Memory.intel || {}
      this.memory.rooms = mem.rooms || {}
      const rooms = Object.keys(Game.rooms)
      log.info(`Collecting intel on ${rooms.length} rooms (${rooms}) Outdated Rooms: ${this.memory.outdated.length}/${Object.keys(this.memory.rooms).length}`)
      for (const key in Game.rooms) {
        if (!this.hasThread(key)) {
          this.createThread(key, this.process.collect, key)
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
      // segments.save(C.SEGMENTS.INTEL, mem)
      Memory.intel = mem
      yield
    }
  }
}

export default new Intel()
