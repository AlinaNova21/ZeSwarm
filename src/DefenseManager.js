import { kernel, restartThread } from '/kernel'
import C from '/constants'
import { createTicket } from './SpawnManager'
import { allowPassage } from './config'


kernel.createProcess('defenseManager', restartThread, defenseManagerTowersThread)

let persistentHostiles = {}
let DIST = 3

function * defenseManagerTowersThread () {
  let focusedTarget = {}
  while (true) {
    if (Math.random() < 0.20) DIST = Math.ceil(Math.random() * 3)
    const rooms = Object.keys(Game.rooms)
    for (const roomName of rooms) {
      const room = Game.rooms[roomName]
      if (room.controller && !room.controller.my && room.controller.level !== 0) continue
      if (!room.controller || room.controller.reservation || room.controller.level === 0) continue
      let needDefenders = false
      const hostiles = room.find(C.FIND_HOSTILE_CREEPS).filter(allowed)
      if (hostiles.length) {
        for (const c of hostiles) {
          persistentHostiles[c.id] = {
            lastSeen: Game.time,
            lastPos: c.pos
          }
        }
        if (hostiles.length > 2) needDefenders = false
        this.log.alert(`Hostiles detected in ${roomName}! ${hostiles}`)
        const healers = hostiles.filter(h => h.getActiveBodyparts(C.HEAL))
        let attackMode = 'closest'
        if (healers.length === hostiles.length) {
          attackMode = 'spread'
        }
        room.towers.forEach((tower, ind) => {
          let target = ''
          switch(attackMode) {
            case 'closest':
              target = tower.pos.findClosestByRange(hostiles)
              break
            case 'spread':
              target = hostiles[ind % hostiles.length]
              break
            case 'pickOne':
              target = pickedTarget
          }
          tower.attack(target)
        })
        if (!room.towers.length || needDefenders) {
          const neededBody = [C.TOUGH, C.TOUGH, C.ATTACK, C.ATTACK, C.ATTACK, C.MOVE, C.MOVE, C.MOVE, C.MOVE, C.MOVE, C.MOVE, C.HEAL]
          const invaderBody = [C.TOUGH, C.ATTACK, C.ATTACK, C.MOVE, C.MOVE, C.MOVE]
          const body = needDefenders ? neededBody : invaderBody
          this.log.alert(`No towers in ${roomName}, requesting defenders`)
          createTicket(`defender`, {
            valid: () => Game.rooms[roomName].find(C.FIND_HOSTILE_CREEPS).length,
            parent: `room_${room.name}`,
            body,
            count: Math.max(2, Math.min(5, hostiles.length * 2)),
            weight: 100,
            memory: {
              role: 'defender'
            }
          })
        }
      } else{
        const creeps = room.find(C.FIND_CREEPS).filter(c => c.my && c.hits < c.hitsMax)
        for (const tower of room.towers) {
          if (!creeps.length) continue
          if (tower.store.getUsedCapacity() * tower.store.getCapacity() * 0.75) continue
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
  const atEdge = creep.pos.x <= DIST || creep.pos.x >= 49 - DIST || creep.pos.y <= DIST || creep.pos.y >= 49 - DIST
  return !atEdge && (!allowPassage.includes(creep.owner.username) || struct)
}
