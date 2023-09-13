import { kernel, threadManager } from './kernel'
import { C } from './constants'
import SafeObject from './lib/SafeObject'

kernel.createProcess('UpgradeManager', threadManager, [
  ['upgradeManager', UpgradeManager]
])

/**
 * @type {Map<string,SafeObject>}
 */
const upContCache = new Map()

/**
 *
 * @param {string} roomName
 * @returns {SafeObject|undefined}
 */
export function getUpgradeContainer(roomName) {
  const room = Game.rooms[roomName]
  if (!upContCache.has(roomName)) {
    const [struct] = room.controller.pos.findInRange(C.FIND_STRUCTURES, 3, { filter: s => [C.STRUCTURE_LINK, C.STRUCTURE_CONTAINER].includes(s.structureType) })
    if (struct) {
      upContCache.set(roomName, struct.safe())
    }
  }
  const cont = upContCache.get(roomName)
  if (cont && !cont.valid) {
    upContCache.delete(roomName)
    return getUpgradeContainer(roomName)
  }
  return cont
}

function * UpgradeManager () {
  while (true) {
    const rooms = Object.values(Game.rooms)
    for (const room of rooms) {
      if (!room.controller || !room.controller.my) continue
      const key = `room:${room.name}`
      if (!this.hasThread(key)) {
        this.createThread(key, roomThread, room.name)
      }
    }
    yield
  }
}

function * roomThread (name) {
  const log = this.log.withPrefix(`${this.log.prefix} [${name}]`)
  while (true) {
    const room = Game.rooms[name]
    if (!room) {
      log.warn(`Room ${name} not mine!`)
      return
    }
    yield
  }
}