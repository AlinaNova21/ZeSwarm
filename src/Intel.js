import { kernel } from './kernel'
import log from './log'
import segments from './MemoryManager'
import C from './constants'

export class Intel {
  constructor () {
    kernel.createThread('intelCollect', this.collectThread())
  }

  findTarget () {
    const mem = segments.load(C.SEGMENTS.INTEL) || {}
    const rooms = Object.values(mem)
    const sorted = _.sortBy(r => {
      if (r.ts < Game.time - 5000) return 0 // We want rooms with recent intel
      if (r.towers.length) return 0 // Can't fight towers, yet
      if (r.safemode) return 0 // Ignore safemode
      const score = 0
      if (r.reserver) score += 1
      if (r.level) score += r.level
      return score
    })
    return sorted[0]
  }

  collect () {}

  * collectThread () {
    const mem = segments.load(C.SEGMENTS.INTEL) || {}
    const rooms = Object.keys(Game.rooms)
    log.info(`Collecting intel on ${rooms.length} rooms (${rooms})`)
    for (const key in Game.rooms) {
      const room = Game.rooms[key]
      const hr = mem.rooms = mem.rooms || {}
      const {
        name,
        controller: {
          id,
          level,
          pos,
          my,
          safeMode,
          owner: { username: owner } = {},
          reservation: { username: reserver, ticksToEnd } = {}
        } = {}
      } = room
      if (hr[name] && hr[name].ts > Game.time - 10) continue // Don't recollect immediately
      const [mineral] = room.find(C.FIND_MINERALS)
      const { mineralType } = mineral || {}
      const smap = ({ id, pos }) => ({ id, pos })
      const cmap = ({ id, pos, body, hits, hitsMax }) => {
        const parts = _.groupBy(body, 'type')
        body = {}
        for (const [type, items] of Object.entries(parts)) {
          body[type] = items.length
        }
        return { id, pos, body, hits, hitsMax }
      }
      hr[room.name] = {
        hostile: level && !my,
        name,
        level,
        owner,
        reserver,
        spawns: room.spawns.map(smap),
        towers: room.towers.map(smap),
        walls: room.constructedWalls.length,
        ramparts: room.ramparts.length,
        creeps: room.find(C.FIND_HOSTILE_CREEPS).map(cmap),
        safemode: safeMode || 0,
        controller: id && { id, pos },
        sources: room.find(C.FIND_SOURCES).map(smap),
        mineral: mineralType,
        ts: Game.time
      }
      yield true
    }
    const outdated = []
    for (const key in mem) {
      if (mem[key].ts < Game.time - 20000) {
        delete mem[key]
      }
      if (mem[key].ts < Game.time - 5000) {
        outdated.push(key)
      }
      yield true
    }
    this.outdated = outdated
    segments.save(C.SEGMENTS.INTEL, mem)
  }
}

export default new Intel()
