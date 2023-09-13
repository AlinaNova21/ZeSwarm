import { kernel, threadManager, sleep } from '../../kernel'
import { Pathing } from './pathing'
import intel from '../../Intel'
import config from '../../config'
import { isAlly } from '../fof'

export * from './pathing'

const threads = [
  ['wallTracking', wallTracking],
  ['avoidRooms', avoidRooms]
]
kernel.createProcess('Pathfinding', threadManager, threads)

function * wallTracking () {
  while (true) {
    const rooms = Object.values(Game.rooms)
    this.log.info(`Recording walls for ${rooms.length} rooms (${rooms.map(r => r.name)})`)
		for (const room of rooms) {
      const mem = Memory.rooms[room.name] = Memory.rooms[room.name] || {}
			// if (mem._wallsTS > Game.time - 1000) continue
			const walls = room.find(FIND_STRUCTURES).filter(s => s.structureType === STRUCTURE_WALL)
      let hasWalls = false
			const cm = new PathFinder.CostMatrix()
			for (const wall of walls) {
				cm.set(wall.pos.x, wall.pos.y, 255)
        hasWalls = true
			}
      if (hasWalls) {
        mem._walls = cm.serialize()
        mem._wallsTS = Game.time
      } else {
        delete mem._walls
        delete mem._wallsTS
        if (Object.keys(mem).length === 0) {
          delete Memory.rooms[room.name]
        }
      }
		}
    yield
  }
}
function* avoidRooms() {
  while (true) {
    const rooms = new Set()
    for (const room of Object.values(intel.rooms)) {
      const invaderCore = room.invaderCore
      const ally = !invaderCore && room.owner && isAlly(room.owner)
      if (room.hostile && !ally) {
        rooms.add(room.name)
      }
    }
    this.log.info(`Updating avoidRooms with ${rooms.size} rooms (${Array.from(rooms)})`)
    Pathing.avoidRooms = Array.from(rooms)
    yield * sleep(5)
  }
}