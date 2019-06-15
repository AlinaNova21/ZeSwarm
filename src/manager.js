const C = require('constants')
const log = require('./log')

function tick() {
  const rooms = Object.values(Game.rooms)
  const sources = []
  const spawns = []
  const spawnQueue = {}
  const census = {}
  for(const room of rooms) {
    if (!room.controller || room.controller.level === 0) continue
    if (room.controller.owner.username !== C.USER) continue
    for (const s of room.find(FIND_SOURCES)) {
      sources.push([ s, room ])
    }
    spawnQueue[room.name] = []
    census[room.name] = {}
    const creeps = room.find(FIND_MY_CREEPS)
    for(const creep of creeps) {
      census[creep.memory.group] = census[creep.memory.group] || 0
      census[creep.memory.group]++
    }
    spawns.push(...(room.spawns || []))
  }

  for (const [source, room] of sources) {
    const smem = room.memory.sources = room.memory.sources || {}
    const data = smem[source.id] = smem[source.id] || {}
    data.pos = { roomName: source.pos.roomName, x: source.pos.x, y: source.pos.y }
    data.id = source.id
    if (!data.dist) {
      const { path, ops, cost, incomplete } = PathFinder.search(source.pos, room.spawns.map(s => ({ pos: s.pos, range: 1 })))
      if (incomplete) {
        log.warn(`Path incomplete to source ${source.room.name} (${source.pos.x},${source.pos.y})`)
        continue
      }
      data.dist = path.length
    }
    if (room.controller.level <= 1) continue
    const maxParts = Math.min(25, Math.floor(((room.energyCapacityAvailable / 50) * 0.8) / 2))
    const needed = Math.max(2, Math.ceil((source.energyCapacity / (C.ENERGY_REGEN_TIME / (data.dist * 2))) / 50)) + 2
    const wantedCarry = Math.ceil(needed / maxParts)
    const wantedWork = Math.min(5, Math.floor((room.energyCapacityAvailable - 100) / 100))
    const cbody = expandBody([maxParts, C.CARRY, maxParts, C.MOVE])
    const wbody = expandBody([1, C.CARRY, 1, C.MOVE, wantedWork, C.WORK])
    const cgroup = `${source.id}c`
    const wgroup = `${source.id}w`
    const neededCreepsCarry = Math.max(0, wantedCarry - (census[cgroup] || 0))
    const neededCreepsWork = Math.max(0, Math.ceil(5 / wantedWork) - (census[wgroup] || 0))
    log.info(`${source.id} ${neededCreepsWork} ${neededCreepsCarry}`)
    if (neededCreepsWork) {
      spawnQueue[room.name].push({
        name: wgroup + Game.time,
        body: wbody,
        cost: wbody.reduce((t, p) => t + C.BODYPART_COST[p], 0),
        memory: {
          group: wgroup,
          home: room.name,
          stack: [['miningWorker', data.pos]]
        }
      })
    }
    if (neededCreepsCarry) {
      spawnQueue[room.name].push({
        name: cgroup + Game.time,
        body: cbody,
        cost: cbody.reduce((t, p) => t + C.BODYPART_COST[p], 0),
        memory: {
          group: cgroup,
          home: room.name,
          stack: [['miningCollector', data.pos, wgroup]]
        }
      })
    }
  }
  for (const room of rooms) {
    if (!room.controller || room.controller.level === 0) continue
    if (room.controller && room.controller.owner.username !== C.USER) continue
    if (room.controller.level >= 3 && room.energyAvailable >= 550) {
      const P2 = ([RANGED_ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, WORK, WORK])[Math.floor(Math.random() * 7)]
      spawnQueue[room.name].push({
        name: `scout${Game.time}-${Math.random().toString(36).slice(-4)}`,
        body: [MOVE, P2],
        cost: C.BODYPART_COST[MOVE] + C.BODYPART_COST[P2],
        memory: {
          stack: [['scout']]
        }
      })
    }
  }
  for (const spawn of spawns) {
    if (spawn.spawning) continue
    const room = spawn.room
    const [{ name, body, cost, memory } = {}] = spawnQueue[room.name].splice(0, 1)
    if (!name) continue
    if (spawn.room.energyAvailable < cost) continue
    log.info(`${spawn.room.name} Spawning ${name} ${memory.group}`)
    spawn.spawnCreep(body, name, { memory })
  }
}

module.exports = {
  tick
}


function expandBody(body) {
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