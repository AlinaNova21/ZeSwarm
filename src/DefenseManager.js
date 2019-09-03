import { kernel, restartThread } from '/kernel'
import C from '/constants'

kernel.createThread('defenseManagerTowers', restartThread(defenseManagerTowersThread))

const allowPassage = ['Sergey']

function * defenseManagerTowersThread () {
  while (true) {
    const rooms = Object.keys(Game.rooms)
    for (const roomName of rooms) {
      const room = Game.rooms[roomName]
      if (room.controller && !room.controller.my && room.controller.level !== 0) continue
      if (!room.controller || room.controller.reservation) continue

      const hostiles = room.find(C.FIND_HOSTILE_CREEPS).filter(allowed)
      if (hostiles.length) {
        room.towers.forEach(tower => {
          const closest = tower.pos.findClosestByRange(hostiles)
          tower.attack(closest)
        })
      } else {
        const creeps = room.find(C.FIND_CREEPS).filter(c => c.hits < c.hitsMax)
        for (const tower of room.towers) {
          if (!creeps.length) continue
          tower.heal(creeps.pop())
        }
        const ramparts = room.ramparts.filter(c => c.hits < 10000)
        const rampart = ramparts.reduce((l, r) => l && l.hits < r.hits ? l : r, null)
        if (rampart && room.storage && room.storage.store.energy > 40000) {
          for (const tower of room.towers) {
            if (tower.energy > tower.energyCapacity / 2) {
              tower.repair(rampart)
            }
          }
        }
        const roads = room.roads.filter(c => c.hits < c.hitsMax / 2)
        const road = roads.reduce((l, r) => l && l.hits < r.hits ? l : r, null)
        if (road && room.storage && room.storage.store.energy > 20000) {
          for (const tower of room.towers) {
            if (tower.energy > tower.energyCapacity / 2) {
              tower.repair(road)
            }
          }
        }
      }
    }
    yield
  }
}

function allowed (creep) {
  const struct = creep.pos.findInRange(creep.room.structures.all, 5)
  return !allowPassage.includes(creep.owner.username) || struct
}
