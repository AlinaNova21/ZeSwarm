const log = require('./log')
const segments = require('./MemoryManager')
const C = require('./constants')

class Intel {
  findTarget() {
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
  collect() {
    const mem = segments.load(C.SEGMENTS.INTEL) || {}
    const rooms = Object.keys(Game.rooms)
    log.info(`Collecting intel on ${rooms.length} rooms (${rooms})`)
    for (const key in Game.rooms) {
      const room = Game.rooms[key]
      let hr = mem.rooms = mem.rooms || {}
      let {
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
      if(hr[name] && hr[name].ts > Game.time - 10) continue // Don't recollect immediately
      let [mineral] = room.find(C.FIND_MINERALS)
      let { mineralType } = mineral || {}
      let smap = ({ id, pos }) => ({ id, pos })
      let cmap = ({ id, pos, body, hits, hitsMax }) => {
        const parts = _.groupBy(body, 'type')
        body = {}
        for(const [type, items] of Object.entries(parts)) {
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
    }
    const outdated = []
    for (const key in mem) {
      if (mem[key].ts < Game.time - 20000) {
        delete mem[key]
      }
      if (mem[key].ts < Game.time - 5000) {
        outdated.push(key)
      }
    }
    this.outdated = outdated
    segments.save(C.SEGMENTS.INTEL, mem)
  }
}

module.exports = new Intel()