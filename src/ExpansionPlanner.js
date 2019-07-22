import intel from './Intel'
import { kernel } from './kernel';
import { Logger } from './log';

const log = new Logger('[ExpansionPlanner]')

kernel.createThread('expansionPlanner', expansionPlanner())

function * expansionPlanner () {
  const targets = new Set()
  while (true) {
    const rooms = Object.values(Game.rooms).filter(r => r.controller && r.controller.my)
    log.info(`Settling: ${Array.from(targets)}`)
    if (Game.gcl.level <= rooms.length + targets.size) {
      yield
      continue
    }
    outer:
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
        targets.add(int.name)
        yield true
        break outer
      }
      yield true
    }
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