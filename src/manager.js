import { kernel } from '/kernel'
import C from './constants'
import log from './log'
import { sleep, restartThread } from './kernel';
import { createTicket, destroyTicket } from './SpawnManager'
import intel from './Intel';

export let census = {}

kernel.createThread('managerThread', restartThread(managerThread))

function * managerThread() {
  while (true) {
    const rooms = Object.values(Game.rooms)
    const sources = []
    const spawns = []
    const spawnQueue = {}
    census = {}
    let srcCount = 0
    for (const room of rooms) {
      spawnQueue[room.name] = []
      census[room.name] = {}
      const creeps = room.find(FIND_MY_CREEPS)
      for (const creep of creeps) {
        if (creep.memory.group) {
          census[creep.memory.group] = census[creep.memory.group] || 0
          census[creep.memory.group]++
        }
        if (creep.memory.role) {
          census[creep.memory.role] = census[creep.memory.role] || 0
          census[creep.memory.role]++
        }
      }
      if (!room.controller || room.controller.level < 2) continue
      if (room.controller.owner.username !== C.USER) continue
      const key = `mining_${room.name}`
      if (!kernel.hasThread(key)) {
        kernel.createThread(key, miningManager(room.name, room.name))
      }
      // Don't remote mine if not enough capacity to spawn full harvesters
      // 1C3M6W = 800
      if (room.energyCapacityAvailable < 800) continue
      const neighbors = Object.values(Game.map.describeExits(room.name))
      log.info(`Found neighbors ${neighbors}`)
      for (const neighbor of neighbors) {
        const int = intel.rooms[neighbor]
        if (!int) continue
        if (int.sources.length <= 2) {
          const valid = !int.hostile && !int.creeps.find(c => c.hostile)
          const key = `mining_${neighbor}`
          if (valid) srcCount += int.sources.length
          if (kernel.hasThread(key) && !valid) {
            log.info(`Revoking remote: ${neighbor}`)
            kernel.destroyThread(key)
          }
          if (!kernel.hasThread(key) && valid) {
            log.info(`Authorizing remote: ${neighbor}`)
            kernel.createThread(key, miningManager(room.name, neighbor))
          }
        }
        yield true
      }
      yield true
    }
    for (const room of rooms) {
      if (!room.controller || room.controller.level === 0) continue
      if (room.controller && !room.controller.my) continue
      const group = `workers${room.name}`
      const reps = Math.max(1, Math.floor((room.energyAvailable - 100) / 150))
      const body = [MOVE, CARRY]
      for (let i = 0; i < reps; i++) {
        if (room.controller.level >= 2 && i % 2 === 1) {
          body.push(MOVE, CARRY)
        } else {
          body.push(MOVE, WORK)
        }
      }
      let workers = 6
      if (room.controller.level === 4) {
        workers = 4
      }
      if (room.controller.level === 2) {
        workers += 10
      }
      if (room.controller.level === 3) {
        workers += Math.floor(srcCount / 2)
      }
      if (room.storage && room.storage.store.energy > 100000) {
        workers += 4
      }
      createTicket(group, {
        // count: room.controller.level >= 4 ? 10 : 6,
        count: workers,
        body,
        memory: {
          role: 'worker',
          homeRoom: room.name,
          room: room.memory.donor || room.name
        }
      })
      if (room.controller.level >= 3 && room.energyAvailable >= 550) {
        createTicket(`scouts_${room.name}`, {
          valid: () => Game.rooms[room.name].controller.level >= 3,
          body: [TOUGH, MOVE],
          memory: {
            role: 'scout'
          },
          count: 10 + Math.min(intel.outdated.length, 10)
        })
      }
      yield true
    }
    yield * sleep(2)
  }
}

function * miningManager (homeRoomName, roomName) {
  const paths = {}
  const remote = homeRoomName !== roomName
  const maxWork = remote ? 6 : 5
  while (true) {
    const homeRoom = Game.rooms[homeRoomName]
    if (!homeRoom || !homeRoom.controller.my) return
    const int = intel.rooms[roomName]
    if (!int) {
      yield * getVision(roomName)
      yield
      continue
    }
    const maxParts = Math.min(25, Math.floor(((homeRoom.energyCapacityAvailable / 50) * 0.8) / 2))
    const timeout = Game.time + 10
    for (const { id, pos: [x, y] } of int.sources) {
      const spos = { x, y, roomName }
      if (!paths[id] || !paths[id].length) {
        const { path, ops, cost, incomplete } = PathFinder.search(spos, homeRoom.spawns.map(s => ({ pos: s.pos, range: 1 })), {
          maxOps: 5000,
          swampCost: 2
        })
        if (incomplete) {
          log.alert(`Path incomplete to source ${spos.x},${spos.y} ${spos.roomName} ops: ${ops} cost: ${cost} path: ${JSON.stringify(path)}`)
          continue
        }
        paths[id] = path
      }
      const dist = paths[id].length
      if (!Game.rooms[roomName]) yield * getVision(roomName)
      const source = Game.getObjectById(id)
      if (!source) {
        log.alert(`Issue finding source: ${id} ${x} ${y} ${roomName} vision: ${Game.rooms[roomName]?'T':'F'}`)
        continue
      }
      const capacity = source.energyCapacity || C.SOURCE_ENERGY_NEUTRAL_CAPACITY
      const energyPerTick = capacity / C.ENERGY_REGEN_TIME
      const roundTrip = dist * 2
      const energyRoundTrip = energyPerTick * roundTrip
      const carryRoundTrip = Math.ceil(energyRoundTrip / 50)
      // log.info(`${id} ${energyPerTick} ${roundTrip} ${energyRoundTrip} ${carryRoundTrip}`)
      const neededCarry = Math.max(2, carryRoundTrip) + 2
      const wantedCarry = (homeRoom.energyCapacityAvailable ? Math.ceil(neededCarry / maxParts) : 0)
      const neededWork = Math.min(maxWork, Math.floor((homeRoom.energyCapacityAvailable - 100) / (remote ? 150 : 100)))
      // const neededWork = energyPerTick / C.HARVEST_POWER
      // const maxWorkParts = (homeRoom.energyCapacityAvailable - 50) 
      const wantedWork = remote ? 1 : (homeRoom.energyCapacityAvailable ? Math.ceil(maxWork / neededWork) : 0)
      const cbody = expandBody([maxParts, C.CARRY, maxParts, C.MOVE])
      const wbody = expandBody([1, C.CARRY, remote ? 3 : 1, C.MOVE, remote ? 6 : neededWork, C.WORK])
      const cgroup = `${id}c`
      const wgroup = `${id}w`
      log.info(`${id} ${wantedCarry} ${wantedWork}`)
      createTicket(wgroup, {
        valid: () => Game.time < timeout,
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
        count: wantedCarry,
        body: cbody,
        memory: {
          role: 'miningCollector',
          room: homeRoomName,
          stack: [['miningCollector', spos, wgroup]]
        }
      })
      yield true
    }
    if (remote) {
      const rgroup = `${roomName}r`
      const { controller: { id, pos } = {} } = Game.rooms[roomName]
      if (id) {
        createTicket(rgroup, {
          valid: () => Game.time < timeout,
          count: 1,
          body: expandBody([2, MOVE, 2, CLAIM]),
          memory: {
            role: 'reserver',
            room: homeRoomName,
            stack: [['repeat', 1500, 'reserveController', id], ['moveNear', pos]]
          }
        })
      }
    }
    // yield * sleep(5)
    yield
  }
}

function * getVision (roomName, timeout = 5000) {
  const ticket = `scout_${roomName}`
  createTicket(ticket, {
    body: [MOVE],
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
  tick,
  census
}

function expandBody (body) {
  let cnt = 1
  const ret = []
  for (const i in body) {
    const t = body[i]
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
