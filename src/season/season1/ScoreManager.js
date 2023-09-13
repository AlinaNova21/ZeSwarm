import intel from '../Intel'
import { kernel, restartThread, sleep } from '../kernel'
import { Logger } from '../log'
import { createTicket, expandBody } from '../SpawnManager'
import { C } from '../constants'
import config from '../config'

if (Game.shard.name === 'shardSeason') {
  kernel.createProcess('ScoreManager', restartThread, scoreManager)
}
const routeCache = new Map()

function findRoute(src, dst, opts = {}) {
  const key = src + dst
  if (!routeCache.has(key)) {
    const route = {
      ts: Game.time,
      path: Game.map.findRoute(src, dst, opts)
    }
    routeCache.set(key, route)
    return route.path
  }
  const route = routeCache.get(key)
  return route.path
}

function* scoreManager() {
  while (true) {
    const roomIntel = Object.values(intel.rooms) // .filter(r => r.hostile)
    const monitoring = new Set()
    const collecting = new Set()
    for (const int of roomIntel) {
      const { name, scoreCollectors = [], scoreContainers = [] } = int
      for (const c of scoreCollectors)  {
        const key = `scoreCollector:${c.id}`
        if (!this.hasThread(key)) {
          this.createThread(key, scoreCollector, name)
        }
        monitoring.add(name)
      }
      for (const c of scoreContainers) {
        if (int.ts + 1000 < Game.time) continue
        continue // Disable this
        const dt = Game.time - c.decayTime
        const [closestRoom, path] = Object.values(Game.rooms)
          .filter(r => r.controller && r.controller.my && r.storage)
          .map(r => [r, findRoute(r.name, name, {})])
          .filter(r => r[1] && r[1].length < 15)
          .reduce((l, n) => l && l[1].length < n[1].length ? l : n, null) || []
        if (!closestRoom) {
          continue
        }
        if ((path.length * 50) > (dt + 50)) {
          continue
        }
        createTicket(`scoreContainer_haulers_${c.id}`, {
          valid: () => Game.time - c.decayTime > path.length * 50,
          parent: `room_${closestRoom.name}`,
          count: 1,
          weight: 2,
          body: expandBody([4, C.MOVE, 4, C.CARRY]),
          memory: {
            role: 'hauler',
            stack: [['hauler', name, c.id, closestRoom.name, closestRoom.storage.id, C.RESOURCE_SCORE]]
          }
        })
        const key = `scoreContainer:${c.id}`
        if (!this.hasThread(key)) {
          this.createThread(key, scoreContainer, name, c.id, closestRoom.name, c.decayTime, path.length)
        }
        collecting.add(name)
      }
    }
    this.log.info(`Monitoring ${monitoring.size} rooms: ${Array.from(monitoring).join(',')}`)
    this.log.info(`Collecting ${collecting.size} rooms: ${Array.from(collecting).join(',')}`)
    // yield * sleep(5)
    yield
  }
}

function * scoreContainer (roomName, scId, closestRoom, decayTime, dist) {
  while (intel.rooms[roomName] && intel.rooms[roomName].scoreContainers.length) {
    createTicket(`scoreContainer_haulers_${scId}`, {
      valid: () => Game.time - decayTime > dist * 50,
      parent: `room_${closestRoom}`,
      count: 1,
      weight: 2,
      body: expandBody([4, C.MOVE, 4, C.CARRY]),
      memory: {
        role: 'hauler',
        stack: [['hauler', roomName, scId, closestRoom, Game.rooms[closestRoom].storage.id, C.RESOURCE_SCORE]]
      }
    })
    yield
  }
}

function * scoreCollector (roomName) {
  while (true) {
    const rooms = Object.values(Game.rooms)
    const [closestRoom, path] = rooms
      .filter(r => r.controller && r.controller.my && r.controller.level >= 2)
      .map(r => [r, findRoute(r.name, roomName, {})])
      .filter(r => r[1] && r[1].length < 25)
      .reduce((l, n) => l && l[1].length < n[1].length ? l : n, null) || []
    if (!closestRoom) {
      this.log.alert(`No available room to attach to ${roomName}`)
      return
    }
    createTicket(`scoreCollector_scouts_${roomName}`, {
      valid: () => Game.rooms[closestRoom.name].controller.level >= 2,
      parent: `room_${closestRoom.name}`,
      body: [C.TOUGH, C.MOVE],
      memory: {
        role: 'scoutVision',
        stack: ['scoutVision', roomName],
        replaceAge: path.length * 50
      },
      count: 1
    })
    const room = Game.rooms[roomName]
    this.memory.path = this.memory.path || {}
    if (room && !this.memory.path[roomName]) {
      const [collector] = room.find(C.FIND_SCORE_COLLECTORS)
      const scout = room.find(C.FIND_MY_CREEPS).find(c => c.memory.role === 'scoutVision')
      if (!scout) {
        yield
        continue
      }
      const walls = room.structures[C.STRUCTURE_WALL]
      const cm = new PathFinder.CostMatrix()
      for (const wall of walls) {
        cm.set(wall.pos.x, wall.pos.y, Math.floor((wall.hits / wall.hitsMax) * 256))
      }
      const { path, incomplete, ops, cost } = PathFinder.search(scout.pos, collector.pos, {
        roomCallback (pfRoomName) {
          if (pfRoomName !== roomName) return false
          return cm
        },
        maxOps: 200000
      })
      this.memory.path[roomName] = path
      this.log.info(`Path: Ops: ${ops} Cost: ${cost}`)
    }
    if (room && this.memory.path[roomName]) {
      room.visual.poly(this.memory.path[roomName], {
        stroke: '#FFFFFF',
        strokeWidth: 0.2,
        opacity: 1
      })
    }
    yield // * sleep(1)
  }
}