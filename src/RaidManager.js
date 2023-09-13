import intel from './Intel'
import { kernel, restartThread, sleep } from './kernel'
import { Logger } from './log'
import { createTicket /*, destroyTicket */ } from './SpawnManager'
import { C } from './constants'
import config from './config'

if (config.raids.enabled) {
  kernel.createProcess('RaidPlanner', restartThread, raidPlanner)
}
const routeCache = new Map()

function findRoute (src, dst, opts = {}) {
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
function * raidPlanner () {
  const raiding = new Set()
  while (true) {
    if (Game.cpu.bucket < 4000) {
      yield
      continue
    }
    
    const roomIntel = Object.values(intel.rooms) // .filter(r => r.hostile)
    for (const int of roomIntel) {
      if (int.ts < Game.time - 10000) {
        this.log.info(`Skipping room ${int.name}, intel too old.`)
        yield true
        continue
      }
      const rooms = Object.values(Game.rooms)
      const [closestRoom/*, range */] = rooms
        .filter(r => r.controller && r.controller.my && r.controller.level >= 3)
        .map(r => [r, findRoute(r.name, int.name, {})])
        .filter(r => r[1] && r[1].length < 15)
        .reduce((l, n) => l && l[1].length < n[1].length ? l : n, null) || []
      if (!closestRoom) {
        this.log.alert(`No available room to raid ${int.name}`)
        yield true
        continue
      }

      let needsClean = false

      needsClean |= !int.safemode && (!int.towers || !int.owner) && (int.spawns || int.walls)
      needsClean |= !int.safemode && int.towers && int.drained
      needsClean &= int.owner !== C.USER
      if (needsClean && raiding.size === 0) {
        const key = `cleaningCrew_${int.name}`
        raiding.add(int.name)
        if (!this.hasThread(key)) {
          this.log.warn(`Creating cleaning crew: ${closestRoom.name} => ${int.name}`)
          this.createThread(key, cleaningCrew, closestRoom.name, int.name)
        }
      } else {
        raiding.delete(int.name)
      }
      yield true
    }
    this.log.info(`Active`)
    yield * sleep(20)
    yield
  }
}

function * cleaningCrew (srcRoom, tgtRoom) {
  const timeout = Game.time + 2000
  while (true) {
    this.log.alert(`Cleaning crew active: ${srcRoom} => ${tgtRoom}`)
    if (Game.time > timeout) return
    const room = Game.rooms[tgtRoom]
    if (room && !room.spawns.length && !room.extensions.length && !room.towers.length) {
      return this.log.alert(`Cleaning crew work done. ${tgtRoom}`)
    }
    const ts = Game.time + 100
    createTicket(`cleaningCrew_${srcRoom}_${tgtRoom}`, {
      valid: () => Game.time < ts,
      parent: `room_${srcRoom}`,
      weight: 1,
      count: 3,
      body: [C.WORK, C.WORK, C.WORK, C.WORK, C.MOVE, C.MOVE, C.MOVE, C.MOVE],
      memory: {
        role: 'cleaningCrew',
        room: srcRoom,
        stack: [['cleaningCrew', tgtRoom]]
      }
    })
    // yield * sleep(5)
    yield
  }
}

// function * getVision (roomName, timeout = 5000) {
//   const ticket = `scout_${roomName}`
//   createTicket(ticket, {
//     body: [MOVE],
//     memory: {
//       role: 'scout',
//       stack: [['scoutVision', roomName]]
//     },
//     count: 1
//   })
//   const start = Game.time
//   while (true) {
//     if (Game.time > start + timeout) return
//     if (Game.rooms[roomName]) {
//       destroyTicket(ticket)
//       return
//     }
//     log.info(`Want to see ${roomName}`)
//     yield
//   }
// }
