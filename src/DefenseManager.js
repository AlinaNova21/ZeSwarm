import { kernel } from '/kernel'

kernel.createThread('defenseManagerTowers', defenseManagerTowersThread())

function * defenseManagerTowersThread () {
  while (true) {
    const rooms = Object.keys(Game.rooms)
    for (const roomName of rooms) {
      const room = Game.rooms[roomName]
      if (room.controller && !room.controller.my && room.controller.level !== 0) continue
      if (!room.controller || room.controller.reservation) continue

      const hostiles = room.find(FIND_HOSTILE_CREEPS)
      if (hostiles.length) {
        room.towers.forEach(tower => {
          const closest = tower.pos.findClosestByRange(hostiles)
          tower.attack(closest)
        })
      }
    }
    yield
  }
}
