import { kernel } from '/kernel'
import C from './constants'
import { Logger } from './log'
import { sleep, restartThread } from './kernel'
import { createTicket, destroyTicket, expandBody } from './SpawnManager'
import intel from './Intel'
import { __, add, clamp, compose, divide, either, max, multiply, subtract } from 'ramda'

export let census = {}
const log = new Logger('[Manager]')
kernel.createProcess('RoomManager', restartThread, managerThread)
// kernel.createThread('managerThread', restartThread(managerThread))

function * managerThread () {
  while (true) {
    const rooms = Object.values(Game.rooms)
    const spawnQueue = {}
    census = {}
    let srcCount = 0
    for (const room of rooms) {
      if (!Game.rooms[room.name]) continue
      this.log.info(`Checking room ${room.name}`)
      spawnQueue[room.name] = []
      census[room.name] = {}
      if (room.spawns.length && room.memory.donor) {
        delete room.memory.donor
      }
      const creeps = room.find(C.FIND_MY_CREEPS)
      for (const creep of creeps) {
        census[creep.memory.room || room.name] = census[creep.memory.room || room.name] || {}
        if (creep.memory.group) {
          census[creep.memory.group] = census[creep.memory.group] || 0
          census[creep.memory.group]++
          census[creep.memory.room || room.name][creep.memory.group] = census[creep.memory.room || room.name][creep.memory.group] || 0
          census[creep.memory.room || room.name][creep.memory.group]++
        }
        if (creep.memory.role) {
          census[creep.memory.role] = census[creep.memory.role] || 0
          census[creep.memory.role]++
          census[creep.memory.room || room.name][creep.memory.role] = census[creep.memory.room || room.name][creep.memory.role] || 0
          census[creep.memory.room || room.name][creep.memory.role]++
        }
      }
      const hostileCreeps = room.find(C.FIND_HOSTILE_CREEPS).filter(c => c.owner.username !== 'Invader')
      if (room.controller && hostileCreeps.length && room.controller.level === 1 && !room.spawns.length) {
        room.controller.unclaim()
        continue
      }
      if (!room.controller || room.controller.level < 2) continue
      if (room.controller.owner.username !== C.USER) {
        this.log.info(`[${room.name}] Not Mine (${C.USER})`)
        continue
      }
      const key = `R${room.name}`
      if (!this.hasThread(key)) {
        this.log.info(`[${room.name}] Creating mining manager`)
        this.createThread(key, miningManager, room.name, room.name)
      }
      // Don't remote mine if not enough capacity to spawn full harvesters
      // 1C3M6W = 800
      if (room.energyCapacityAvailable < 550) continue
      const neighbors = Object.values(Game.map.describeExits(room.name))
      log.info(`[${room.name}] Found neighbors ${neighbors}`)
      for (const neighbor of neighbors) {
        const int = intel.rooms[neighbor]
        if (!int) continue
        if (int.sources.length <= 2) {
          const valid = !int.hostile && !int.creeps.find(c => c.hostile)
          const key = `r${neighbor}`
          if (valid) srcCount += int.sources.length
          if (this.hasThread(key) && !valid) {
            log.info(`Revoking remote: ${neighbor}`)
            this.destroyThread(key)
          }
          if (!this.hasThread(key) && valid) {
            log.info(`Authorizing remote: ${neighbor}`)
            this.createThread(key, miningManager, room.name, neighbor)
          }
        }
      }
      // yield true
    }
    for (const room of rooms) {
      if (!Game.rooms[room.name]) continue
      if (!room.controller || room.controller.level === 0) continue
      if (room.controller && !room.controller.my) continue
      const group = `workers_${room.name}`
      const reps = compose(clamp(1, 24), Math.floor, divide(__, 150), subtract(__, 100))(room.energyAvailable)
      const body = [C.MOVE, C.CARRY]
      for (let i = 0; i < reps; i++) {
        if (room.level >= 2 && i % 2 === 1) {
          body.push(C.MOVE, C.CARRY)
        } else {
          body.push(C.MOVE, C.WORK)
        }
      }
      let workers = 6
      if (room.level === 4) {
        workers = 4
      }
      if (room.level === 2) {
        workers += 10
      }
      if (room.level === 3) {
        workers += Math.floor(srcCount / 2)
      }
      if (room.storage && room.storage.store.energy < 20000) {
        workers = room.energyAvailable > 400 ? 2 : 4
      }
      if (room.storage && room.storage.store.energy > 100000) {
        workers += 4
      }
      createTicket(group, {
        // count: room.controller.level >= 4 ? 10 : 6,
        parent: `room_${room.memory.donor || room.name}`,
        weight: (!census[room.name][group] || census[room.name][group] < 2) ? 100 : 20,
        count: workers,
        body,
        memory: {
          role: 'worker',
          homeRoom: room.name,
          room: room.memory.donor || room.name
        }
      })
      if (room.controller.level > 1) {
        const lowEnergy = room.storage && room.storage.store.energy < 10000
        createTicket(`feeder_${room.name}`, {
          parent: `room_${room.memory.donor || room.name}`,
          weight: 10,
          count: Math.min(lowEnergy ? 1 : 3, Math.ceil(room.controller.level / 3)),
          body: expandBody([3, C.MOVE, 3, C.CARRY]),
          memory: {
            role: 'feeder',
            homeRoom: room.name,
            room: room.memory.donor || room.name
          }
        })
      }
      if (room.controller.level >= 2 && room.energyAvailable >= 500) {
        createTicket(`scouts_${room.name}`, {
          valid: () => Game.rooms[room.name].controller.level >= 2,
          parent: `room_${room.name}`,
          body: [C.TOUGH, C.MOVE],
          memory: {
            role: 'scout'
          },
          count: 5 // + Math.min(intel.outdated.length, 10)
        })
      }
      // yield true
    }
    // yield * sleep(20)
    yield
  }
}

function * miningManager (homeRoomName, roomName) {
  const paths = {}
  const remote = homeRoomName !== roomName
  const maxWork = remote ? 6 : 5
  const nodeName = `miningManager_${homeRoomName}`
  createTicket(`miningManager_${homeRoomName}`, {
    parent: `room_${homeRoomName}`,
    weight: remote ? 1 : 20
  })
  while (true) {
    const homeRoom = Game.rooms[homeRoomName]
    if (!homeRoom || !homeRoom.controller.my) {
      log.alert(`No vision in ${homeRoomName}`)
      return
    }
    const int = intel.rooms[roomName]
    if (!int) {
      log.alert(`No intel for ${homeRoomName}`)
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
          log.alert(`Path incomplete to source ${spos.x},${spos.y} ${spos.roomName} ops: ${ops} cost: ${cost} path: ${JSON.stringify(path)}`)
          yield true
          continue
        }
        paths[id] = path
      }
      const dist = paths[id].length
      if (!Game.rooms[roomName]) yield * getVision(roomName, 100)
      const source = Game.getObjectById(id)
      if (!source) {
        log.alert(`Issue finding source: ${id} ${x} ${y} ${roomName} vision: ${Game.rooms[roomName] ? 'T' : 'F'}`)
        yield true
        continue
      }
      const maxEnergy = (homeRoom.storage && homeRoom.storage.store.energy < 1000 && Math.max(300, homeRoom.energyAvailable)) || homeRoom.energyCapacityAvailable
      const energyPerTick = divide(either(source.energyCapacity, C.SOURCE_ENERGY_NEUTRAL_CAPACITY), C.ENERGY_REGEN_TIME)
      const roundTrip = multiply(dist, 2)
      const energyRoundTrip = multiply(energyPerTick, roundTrip)
      const carryRoundTrip = Math.ceil(divide(energyRoundTrip, 50))
      // log.info(`${id} ${energyPerTick} ${roundTrip} ${energyRoundTrip} ${carryRoundTrip}`)
      const neededCarry = add(2, max(2, carryRoundTrip))
      const wantedCarry = (maxEnergy ? Math.ceil(neededCarry / maxParts) : 0)
      const neededWork = clamp(1, maxWork, Math.floor((maxEnergy - 100) / (remote ? 150 : 100)))
      // const neededWork = energyPerTick / C.HARVEST_POWER
      // const maxWorkParts = (homeRoom.energyCapacityAvailable - 50)
      const wantedWork = remote ? 1 : (maxEnergy ? Math.ceil(maxWork / neededWork) : 0)
      const cbody = expandBody([maxParts, C.CARRY, maxParts, C.MOVE])
      const wbody = expandBody([1, C.CARRY, remote ? 3 : 1, C.MOVE, remote ? 6 : neededWork, C.WORK])
      const cgroup = `${id}c`
      const wgroup = `${id}w`
      // log.info(`${id} ${wantedCarry} ${wantedWork}`)
      createTicket(wgroup, {
        valid: () => Game.time < timeout,
        parent: nodeName,
        weight: 2,
        count: wantedWork,
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
        weight: 1,
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
      const { controller: { id, level, pos } = {} } = Game.rooms[roomName]
      if (id) {
        const dual = level < 4
        createTicket(rgroup, {
          valid: () => Game.time < timeout,
          parent: nodeName,
          weight: 3,
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
