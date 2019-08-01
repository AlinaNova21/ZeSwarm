import intel from './Intel'
import { kernel, restartThread, sleep } from './kernel';
import { Logger } from './log';
import { createTicket, destroyTicket } from './SpawnManager';
import C from './constants'

const log = new Logger('[RaidPlanner]')

kernel.createThread('RaidPlanner', restartThread(raidPlanner))

function * raidPlanner() {
  while (true) {
    const roomIntel = Object.values(intel.rooms).filter(r => r.hostile)
    for (const int of roomIntel) {
      if (int.ts < Game.time - 10000) {
        yield true
        continue
      }
      const rooms = Object.values(Game.rooms)
      const [closestRoom, range] = rooms
        .filter(r => r.controller && r.controller.my && r.controller.level >= 3)
        .map(r => [r, Game.map.findRoute(r.name, int.name, {})])
        .filter(r => r[1] && r[1].length < 25)
        .reduce((l, n) => l && l[1].length < n[1].length ? l : n, null) || []
      if (!closestRoom) { 
        log.alert(`No available room to raid ${int.name}`)
        yield true
        continue
      }
      if (!int.safemode && !int.towers && int.spawns) {
        const key = `cleaningCrew_${int.name}`
        if (!kernel.hasThread(key)) {
          log.warn(`Creating cleaning crew active: ${closestRoom} => ${int.name}`)
          kernel.createThread(key, cleaningCrew(closestRoom.name, int.name))
        }
      }

      if (!int.safemode && int.towers && int.drained) {
        const room = Game.rooms[int.name]
        const key = `cleaningCrew_${int.name}`
        if (!kernel.hasThread(key)) {
          log.warn(`Creating cleaning crew active: ${closestRoom} => ${int.name}`)
          kernel.createThread(key, cleaningCrew(closestRoom.name, int.name))
        }
      }
      yield true
    }
    log.info(`Active`)
    // yield * sleep(5)
    yield
  }
}


function * cleaningCrew (srcRoom, tgtRoom) {
  const timeout = Game.time + 2000
  while (true) {
    log.alert(`Cleaning crew active: ${srcRoom} => ${tgtRoom}`)
    if (Game.time > timeout) return
    const room = Game.rooms[tgtRoom]
    if (room && !room.spawns.length && !room.extensions.length && !room.towers.length) {
      return log.alert(`Cleaning crew work done. ${tgtRoom}`)
    }
    const ts = Game.time + 100
    createTicket(`cleaningCrew_${srcRoom}_${tgtRoom}`, {
      valid: () => Game.time < ts,
      count: 3,
      body: [WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE],
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

function * getVision(roomName, timeout = 5000) {
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
      return
    }
    log.info(`Want to see ${roomName}`)
    yield
  }
}