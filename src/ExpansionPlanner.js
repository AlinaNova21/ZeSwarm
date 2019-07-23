import intel from './Intel'
import { kernel, restartThread } from './kernel';
import { Logger } from './log';
import { createTicket } from './SpawnManager';

const log = new Logger('[ExpansionPlanner]')

kernel.createThread('expansionPlanner', restartThread(expansionPlanner))

function * expansionPlanner () {
  while (true) {
    const targets = new Set(Memory.targets || [])
    const rooms = Object.values(Game.rooms).filter(r => r.controller && r.controller.my)
    log.info(`Settling: ${targets.size ? Array.from(targets).map(a => a[1]) : 'Nowhere'}`)
    const timeout = Game.time + 1000
    for (const [src, dest, expire] of targets) {
      const key = `createNest_${dest}`
      if (Game.time >= expire) {
        if (kernel.hasThread(key)) {
          kernel.destroyThread(key)
        }
      }
      if (!kernel.hasThread(key)) {
        log.info(`Creating nest thread for ${dest}`)
        kernel.createThread(key, createNest(src, dest, timeout))
      }
    }
    if (Game.gcl.level <= rooms.length + targets.size) {
      yield
      continue
    }
    const candidates = new Set()
    for (const room of rooms) {
      if (targets.has(room.name)) targets.delete(room.name)
      for (const int of Object.values(intel.rooms)) {
        if (!int.controller) continue // Not claimable
        if (int.sources.length < 2) continue // We want at least 2 sources
        const lRange = Game.map.getRoomLinearDistance(room.name, int.name)
        if (lRange > 5) continue
        const route = Game.map.findRoute(room.name, int.name, { routeCallback: avoidHostile })
        if (route.length > 8) continue // Avoid settling too far
        if (route.length < 4) continue // Avoid settling too close
        // kernel.createThread(`settle_${int.name}`, settleRoom(room.name, int.name))
        log.info(`Found room to settle: ${int.name} ${lRange} ${route.length}`)
        candidates.add([room.name, int.name, timeout])
        yield true
      }
      yield true
    }
    if (candidates.size) {
      const arr = Array.from(candidates)
      targets.add(arr[Math.floor(Math.random() * arr.length)])
    }
    Memory.targets = Array.from(targets)
    yield
  }
}

function avoidHostile (roomName, fromRoomName) {
  const int = intel.rooms[roomName]
  if (!int) return 10
  if (int.hostile) return Infinity
  if (int.sources.length > 2) return 5
  return 1
}

function * createNest (src, target, expire) {
  const log = new Logger(`[Nesting${target}]`)
  while (true) {
    if (Game.time >= expire) return
    if (Game.rooms[target] && Game.rooms[target].controller.my) return
    const int = intel.rooms[target]
    const room = Game.rooms[target]
    const timeout = Math.min(timeout, Game.time + 200)
    console.log(`Wanted: Claimer. Where: ${target}`)
    createTicket(`claimer_${target}`, {
      valid: () => Game.time < timeout,
      count: 1,
      body: [MOVE, CLAIM],
      memory: {
        role: 'claimer',
        room: src,
        stack: [['claimRoom', target]]
      }
    })
    yield
  }
}