import { kernel } from '@/kernel'
import { C } from './constants'
import { Logger } from './log'
import { sleep, restartThread } from './kernel'
import { createTicket, destroyTicket, expandBody, census } from './SpawnManager'
import intel from './Intel'
import config from './config'
import { __, add, clamp, compose, divide, either, max, multiply, subtract, mathMod } from 'ramda'

import { isHostile } from './DefenseManager'

kernel.createProcess('RoomManager', restartThread, RoomManager)

const routeCache = new Map()

const nests = new Set()
const remotes = new Map()

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

function * RoomManager () {
  while (true) {
    const rooms = Object.values(Game.rooms)
    for (const room of rooms) {
      if (room.controller && room.controller.my) {
        nests.add(room.name)
      } else if (nests.has(room.name)) {
        nests.delete(room.name)
      }
    }
    for (const name of nests) {
      const key = `nest:${name}`
      if (!this.hasThread(key)) {
        this.createThread(key, nestThread, name)
      }
    }
    for (const [name, parent] of remotes) {
      const key = `remote:${name}`
      if (!this.hasThread(key)) {
        this.createThread(key, remoteThread, name, parent)
      }
    }
    yield
  }
}

function* nestThread(name) {
  const log = this.log.withPrefix(`${this.log.prefix} [${name}]`)
  while (true) {
    const room = Game.rooms[name]
    if (!room) throw new Error(`No vision for nest ${name}`)
    if (!room.controller.my) return this.log.warn(`Nest ${name} not owned by me`)
    
    const hostileCreeps = room.find(C.FIND_HOSTILE_CREEPS).filter(c => c.owner.username !== 'Invader').filter(isHostile)
    if (room.controller && hostileCreeps.length && room.controller.level === 1 && !room.spawns.length) {
      room.controller.unclaim()
      this.log.warn(`Unclaiming ${room.name}. hostileCreeps: ${hostileCreeps}`)
      yield
      return
    }

    if (room.spawns.length && room.memory.donor) {
      delete room.memory.donor
    }

    if (!room.spawns.length && !room.memory.donor) {
      const [closestRoom, path] = Object.values(Game.rooms)
        .filter(r => r.controller && r.controller.my)
        .map(r => [r, findRoute(r.name, name, {})])
        .filter(r => r[1] && r[1].length < 15)
        .reduce((l, n) => l && l[1].length < n[1].length ? l : n, null) || []
      if (closestRoom) {
        room.memory.donor = closestRoom.name
      }
    }

    if (room.controller.owner.username !== C.USER) {
      log.info(`Not Mine (${room.controller.owner.username}, ${C.USER})`)
      yield
      continue
    }
    const key = `miningManager:${room.name}`
    if (!this.hasThread(key)) {
      log.info(`Creating mining manager`)
      this.createThread(key, miningManager, room.name, room.name)
    }
    // Don't remote mine if not enough capacity to spawn full harvesters
    // 1C3M6W = 800
    if (room.energyCapacityAvailable >= 550 && room.controller.level >= 2) {
      const neighbors = Object.values(Game.map.describeExits(room.name))
      log.info(`Found neighbors ${neighbors}`)
      const lowEnergy = room.storage && room.storage.store[C.RESOURCE_ENERGY] < 10000
      const candidates = []
      for (const neighbor of neighbors) {
        const int = intel.rooms[neighbor]
        if (!int) continue
        if (int.sources.length <= 2) {
          const friend = int.owner && config.allies.includes(int.owner.toLowerCase())
          const valid = !lowEnergy && !int.hostile && (!int.reserver || int.reserver == C.USER) && !friend && !int.creeps.find(c => c.hostile)
          // if (valid) srcCount += int.sources.length
          if (remotes.has(neighbor) && !valid) {
            log.info(`Revoking remote: ${neighbor}`)
            remotes.delete(neighbor)
          }
          if (!remotes.has(neighbor) && valid) {
            candidates.push([neighbor, int.sources.length])
          }
        }
      }
      const storageSupport = room.storage ? Math.min(room.storage.store[C.RESOURCE_ENERGY] / 5000) : 0

      const limit = room.spawns.length > 1 ? 10 : (storageSupport || 2)
      candidates.sort((a,b) => b[1] - a[1])
      for (const [n,] of candidates.slice(0, limit)) {
        log.info(`Authorizing remote: ${n}`)
        remotes.set(n, room.name)
      }
    }

    const group = `workers_${room.name}`
    const reps = compose(clamp(1, 5), Math.floor, divide(__, 150), subtract(__, 100))(room.energyAvailable)
    const body = [C.MOVE, C.CARRY]
    for (let i = 0; i < reps; i++) {
      if (room.level >= 2 && i % 2 === 1) {
        body.push(C.MOVE, C.CARRY)
      } else {
        body.push(C.MOVE, C.WORK)
      }
    }
    let workers = 4
    if (room.controller.level === 2) {
      // workers += 4
    }
    if (room.level === 3) {
      workers += 6
    }
    if (room.level >= 4) {
      workers = 2
    }
    createTicket(group, {
      // count: room.controller.level >= 4 ? 10 : 6,
      parent: `room_${room.memory.donor || room.name}`,
      weight: (!census[room.name] || census[room.name][group] || census[room.name][group] < 2) ? 100 : 20,
      count: workers,
      body,
      memory: {
        role: 'worker',
        homeRoom: room.name,
        room: room.memory.donor || room.name
      }
    })
    if (room.storage) {
      createTicket(`builders_${room.name}`, {
        parent: `room_${room.name}`,
        count: 1,
        weight: 10,
        body: expandBody([6, MOVE, 6, WORK, 6, CARRY]),
        memory: {
          role: 'builder',
          run: 'builder'
        }
      })
    }
    if (room.controller.level > 1 && room.energyCapacityAvailable >= 400) {
      const lowEnergy = room.storage && room.storage.store.energy < 10000
      let count = Math.min(lowEnergy ? 1 : 3, Math.ceil(room.controller.level / 2))
      if (room.controller.level === 4 && room.storage) {
        count += 2
      }
      const ratio = room.storage ? 2 : 1
      const cost = (50 * ratio) + 50
      const iterations = Math.min(10, Math.floor(room.energyAvailable / cost))
      const cparts = iterations * ratio
      const mparts = iterations
      count = Math.min(3, Math.ceil(30 / cparts))
      createTicket(`feeder_${room.name}`, {
        parent: `room_${room.memory.donor || room.name}`,
        weight: 30,
        count,
        body: expandBody([mparts, C.MOVE, cparts, C.CARRY]),
        memory: {
          role: 'feeder',
          homeRoom: room.name,
          room: room.memory.donor || room.name
        }
      })
    }
    if (room.energyCapacityAvailable >= 500) {
      const lowEnergy = room.storage && room.storage.store.energy < 20000
      const downgrade = room.controller.ticksToDowngrade && room.controller.ticksToDowngrade < 10000
      let count = lowEnergy ? 1 : 2
      if (room.controller.level < 4) {
        count = 6
      }
      if (room.storage && room.storage.store.energy > 50000) {
        count += 1
      }
      if (room.storage && room.storage.store.energy > 75000) {
        count += 2
      }
      if (room.controller.level === 8) count = 1
      if (lowEnergy && !downgrade) count = 0
      const creps = 3 // room.storage  ? 1 : 3
      const baseCost = creps * 100 // MMMCCC
      const costPerWRep = 150 // MW
      const wreps = room.controller.level === 8 ? 15 : Math.min(32, Math.floor((room.energyCapacityAvailable - baseCost) / costPerWRep))
      const mreps = Math.ceil((wreps + creps) / (room.storage ? 2 : 1))
      createTicket(`upgrader_${room.name}`, {
        parent: `room_${room.memory.donor || room.name}`,
        weight: 5,
        count,
        body: expandBody([mreps, C.MOVE, creps, C.CARRY, wreps, C.WORK]),
        memory: {
          run: 'upgrader',
          homeRoom: room.name,
          room: room.memory.donor || room.name
        }
      })
      const [upCont] = room.controller.pos.findInRange(C.FIND_STRUCTURES, 3, { filter: { structureType: C.STRUCTURE_CONTAINER } })
      if (room.storage && upCont) {
        const lowEnergy = room.storage && room.storage.store.energy < 20000
        const higherEnergy = room.storage && room.storage.store.energy > 40000
        const size = Math.floor(Math.min(20, Math.floor(room.energyCapacityAvailable / 150)) / 2) * 2
        let count = lowEnergy ? 0 : (higherEnergy ? 3 : 2)
        if (room.storage && room.storage.store.energy > 50000) {
          count += 1
        }
        if (room.storage && room.storage.store.energy > 75000) {
          count += 2
        }
        createTicket(`upgrade_hauler_${room.name}`, {
          parent: `room_${room.name}`,
          weight: 5,
          count,
          body: expandBody([size / (room.storage ? 2 : 1), C.MOVE, size, C.CARRY]),
          memory: {
            run: 'upgradeHauler',
            homeRoom: room.name,
            room: room.memory.donor || room.name
            // stack: [
            //   ['hauler', room.name, room.storage.id, room.name, upCont.id, C.RESOURCE_ENERGY]
            // ]
          }
        })
        // hauler(fromRoom, fromId, toRoom, toId, resourceType = C.RESOURCE_ENERGY, cache = {}) {
      }
    }
    if (room.controller.level >= 2) {
      let surge = 0
      // if (room.level >= 4 && Math.random() > 0.80) surge = 10
      createTicket(`scouts_${room.name}`, {
        valid: () => Game.rooms[room.name].controller.level >= 2,
        parent: `room_${room.name}`,
        // body: [C.TOUGH, C.MOVE],
        body: [C.MOVE],
        memory: {
          role: 'scout'
        },
        weight: 1,
        count: room.energyAvailable >= 500 ? 5 + surge : 3 // + Math.min(intel.outdated.length, 10)
      })
      if (surge) yield * sleep(30)
    }
    yield
  }
}

function * remoteThread (name, parent) {
  const log = this.log.withPrefix(`${this.log.prefix} [${name}]`)
  createTicket(`room_${name}`, {
    parent: `room_${parent}`,
    weight: 1
  })
  while (true) {
    if (!remotes.has(name)) return
    const key = `miningManager:${name}`
    if (!this.hasThread(key)) {
      log.info(`Creating mining manager`)
      this.createThread(key, miningManager, parent, name)
    }
    yield
  }
}

function * miningManager (homeRoomName, roomName) {
  const paths = {}
  const remote = homeRoomName !== roomName
  const maxWork = remote ? 6 : 5
  const nodeName = `miningManager_${homeRoomName}`
  createTicket(`miningManager_${homeRoomName}`, {
    parent: `room_${roomName}`,
    weight: remote ? 1 : 20
  })
  while (true) {
    const homeRoom = Game.rooms[homeRoomName]
    if (!homeRoom || !homeRoom.controller.my) {
      this.log.alert(`No vision in ${homeRoomName}`)
      return
    }
    const int = intel.rooms[roomName]
    if (!int) {
      this.log.alert(`No intel for ${homeRoomName}`)
      return
    }
    const maxParts = compose(clamp(1, 25), Math.floor, divide(__, 2), multiply(0.8), divide(__, 50))(homeRoom.energyCapacityAvailable)
    const timeout = add(Game.time, 10)
    for (const { id, pos: [x, y] } of int.sources) {
      const spos = { x, y, roomName }
      if (!paths[id] || !paths[id].length) {
        const { path, ops, cost, incomplete } = PathFinder.search(spos, homeRoom.spawns.map(s => ({ pos: s.pos, range: 1 })), {
          maxOps: 5000,
          swampCost: 2
        })
        if (incomplete) {
          this.log.alert(`Path incomplete to source ${spos.x},${spos.y} ${spos.roomName} ops: ${ops} cost: ${cost} path: ${JSON.stringify(path)}`)
          yield true
          continue
        }
        paths[id] = path
      }
      const dist = paths[id].length
      if (!Game.rooms[roomName]) yield * getVision(roomName, 100)
      const source = Game.getObjectById(id)
      const mult = Math.ceil(source.energyCapacity / 3000)
      if (!source) {
        this.log.alert(`Issue finding source: ${id} ${x} ${y} ${roomName} vision: ${Game.rooms[roomName] ? 'T' : 'F'}`)
        yield true
        continue
      }
      /**
       * 
       * @param {StructureSource} source 
       * @returns {[x: number, y: number][])
       */
      const findFreeSpots = source => {
        const terrain = Game.map.getRoomTerrain(roomName)
        /** @type {[x: number, y: number][]} */
        const ret = []
        for (let y = -1; y <= 1; y++) {
          for (let x = -1; x <= 1; x++) {
            const [xx, yy] = [source.pos.x + x, source.pos.y + y]
            if (!(terrain.get(xx, yy) & TERRAIN_MASK_WALL)) {
              ret.push([xx,yy])
            }
          }
        }
        return ret
      }
      const maxWorkers = findFreeSpots(source).length
      const maxEnergy = (homeRoom.storage && homeRoom.storage.store.energy < 1000) ? Math.max(300, homeRoom.energyAvailable) : homeRoom.energyCapacityAvailable
      const energyPerTick = divide(either(source.energyCapacity, C.SOURCE_ENERGY_NEUTRAL_CAPACITY), C.ENERGY_REGEN_TIME)
      const roundTrip = multiply(dist + 20, 2)
      const energyRoundTrip = multiply(energyPerTick, roundTrip)
      const carryRoundTrip = Math.ceil(divide(energyRoundTrip, 50))
      // log.info(`${id} ${energyPerTick} ${roundTrip} ${energyRoundTrip} ${carryRoundTrip}`)
      const neededCarry = add(4, max(2, carryRoundTrip))
      const wantedCarry = ((maxEnergy || remote) ? Math.ceil(neededCarry / maxParts) : 1)
      const neededWork = clamp(1, maxWork, Math.floor((maxEnergy - 100) / (remote ? 150 : 100)))
      // const neededWork = energyPerTick / C.HARVEST_POWER
      // const maxWorkParts = (homeRoom.energyCapacityAvailable - 50)
      const wantedWork = Math.min(maxWorkers, remote ? 1 : (maxEnergy ? Math.ceil(maxWork / neededWork) : 1))
      const hasRoads = !remote && homeRoom.storage
      const cbody = expandBody([maxParts, C.CARRY, Math.ceil(maxParts * (hasRoads ? 0.5 : 1)), C.MOVE])
      const wbody = expandBody([1, C.CARRY, remote ? 3 : 1, C.MOVE, remote ? 6 : neededWork, C.WORK])
      const cgroup = `${id}c`
      const wgroup = `${id}w`
      // log.info(`${id} ${wantedCarry} ${wantedWork}`)
      createTicket(wgroup, {
        valid: () => Game.time < timeout,
        parent: nodeName,
        weight: 4,
        count: Math.min(wantedWork * mult, maxWorkers),
        body: wbody,
        memory: {
          role: 'miningWorker',
          room: homeRoomName,
          stack: [['miningWorker', spos]]
        }
      })
      createTicket(cgroup, {
        valid: () => Game.time < timeout,
        parent: nodeName,
        weight: 2,
        count: wantedCarry,
        body: cbody,
        memory: {
          role: 'miningCollector',
          room: homeRoomName,
          stack: [['miningCollector', spos, wgroup]]
        }
      })
    }
    if (remote) {
      const rgroup = `${roomName}r`
      if (!Game.rooms[roomName]) {
        yield
        continue
      }
      const { controller: { id, pos } = {} } = Game.rooms[roomName]
      const { controller: { level } = {} } = Game.rooms[homeRoomName]
      if (id) {
        const dual = level < 4
        createTicket(rgroup, {
          valid: () => Game.time < timeout,
          parent: nodeName,
          weight: level <= 3 ? 1 : 10,
          count: dual ? 2 : 1,
          body: expandBody([dual ? 1 : 2, C.MOVE, dual ? 1 : 2, C.CLAIM]),
          memory: {
            role: 'reserver',
            room: homeRoomName,
            stack: [['repeat', 1500, 'reserveController', id], ['moveNear', pos], ['moveToRoom', roomName]]
          }
        })
      }
    }
    yield * sleep(5)
    yield
  }
}

function * getVision (roomName, timeout = 5000) {
  const ticket = `scout_${roomName}`
  createTicket(ticket, {
    body: [C.MOVE],
    memory: {
      role: 'scout',
      stack: [['scoutVision', roomName]]
    },
    count: 1
  })
  const start = Game.time
  while (true) {
    if (Game.time > start + timeout) return
    if (Game.rooms[roomName]) {
      destroyTicket(ticket)
    }
    yield
  }
}

export default {
  census
}
