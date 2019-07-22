import { kernel } from '/kernel'

kernel.createThread('defenseManagerTowers', defenseManagerTowersThread())

const allowPassage = ['Sergey']

function * defenseManagerTowersThread () {
  while (true) {
    const rooms = Object.keys(Game.rooms)
    for (const roomName of rooms) {
      const room = Game.rooms[roomName]
      if (room.controller && !room.controller.my && room.controller.level !== 0) continue
      if (!room.controller || room.controller.reservation) continue

      const hostiles = room.find(FIND_HOSTILE_CREEPS).filter(allowed)
      if (hostiles.length) {
        room.towers.forEach(tower => {
          const closest = tower.pos.findClosestByRange(hostiles)
          tower.attack(closest)
        })
      } else {
        const creeps = room.find(FIND_CREEPS).filter(c => c.hits < c.hitsMax)
        for (const tower of room.towers) {
          if (!creeps.length) break
          tower.heal(creeps.pop())
        }
      }
    }
    yield
  }
}

function allowed(creep) {
  const struct = creep.pos.findInRange(creep.room.structures.all, 5)
  return !allowPassage.includes(creep.owner.username) || struct
}