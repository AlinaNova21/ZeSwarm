import { kernel } from '/kernel'
import C from './constants'
import log from './log'
import { sleep } from './kernel';
import { createTicket } from './SpawnManager'
import intel from './Intel';

export let census = {}

kernel.createThread('managerThread', managerThread())

function * managerThread() {
  while (true) {
    yield * tick()
    yield * sleep(2)
  }
}

function * tick () {
  const rooms = Object.values(Game.rooms)
  const sources = []
  const spawns = []
  const spawnQueue = {}
  census = {}
  for (const room of rooms) {
    spawnQueue[room.name] = []
    census[room.name] = {}
    const creeps = room.find(FIND_MY_CREEPS)
    for (const creep of creeps) {
      if (creep.memory.group) {
        census[creep.memory.group] = census[creep.memory.group] || 0
        census[creep.memory.group]++
      }
      if (creep.memory.role) {
        census[creep.memory.role] = census[creep.memory.role] || 0
        census[creep.memory.role]++
      }
    }
    if (!room.controller || room.controller.level === 0) continue
    if (room.controller.owner.username !== C.USER) continue
    for (const s of room.find(FIND_SOURCES)) {
      sources.push([s, room])
    }
    spawns.push(...(room.spawns || []))
    const neighbors = Object.values(Game.map.describeExits(room.name))
    console.log(`Found neighbors ${neighbors}`)
    for (const neighbor of neighbors) {
      const int = intel.rooms[neighbor]
      if (!int) continue
      console.log(`Considering ${neighbor} for remote H:${!!int.hostile && !int.creeps.find(c => c.hostile)}`)
      if (int.sources.length === 2 && !int.hostile && !int.creeps.find(c => c.hostile)) {
        // if (!Game.rooms[neighbor]) {
        //   console.log(`No vision in ${neighbor}`)
        //   this.outdated.push(neighbor)
        //   continue
        // }
        console.log(`Using ${neighbor} as remote`)
        for (const { id, pos: [x, y] } of int.sources) {
          sources.push([{ id, pos: { x, y, roomName: neighbor } }, room])
        }   
      }
    }
  }

  for (const [source, room] of sources) {
    const smem = room.memory.sources = room.memory.sources || {}
    const data = smem[source.id] = smem[source.id] || {}
    data.pos = { roomName: source.pos.roomName, x: source.pos.x, y: source.pos.y }
    data.id = source.id
    if (!data.dist) {
      const { path, ops, cost, incomplete } = PathFinder.search(source.pos, room.spawns.map(s => ({ pos: s.pos, range: 1 })))
      if (incomplete) {
        log.warn(`Path incomplete to source ${source.room.name} (${source.pos.x},${source.pos.y})`)
        continue
      }
      data.dist = path.length
    }
    if (room.controller.level <= 1) continue
    const maxParts = Math.min(25, Math.floor(((room.energyCapacityAvailable / 50) * 0.8) / 2))
    const needed = Math.max(2, Math.ceil(((source.energyCapacity || C.SOURCE_ENERGY_NEUTRAL_CAPACITY) / (C.ENERGY_REGEN_TIME / (data.dist * 2))) / 50)) + 2
    const wantedCarry = Math.ceil(needed / maxParts)
    const wantedWork = Math.min(5, Math.floor((room.energyCapacityAvailable - 100) / 100))
    const cbody = expandBody([maxParts, C.CARRY, maxParts, C.MOVE])
    const wbody = expandBody([1, C.CARRY, room.name === source.pos.roomName ? 1 : wantedWork, C.MOVE, wantedWork, C.WORK])
    const cgroup = `${source.id}c`
    const wgroup = `${source.id}w`
    log.info(`${source.id} ${wantedCarry} ${5 / wantedWork}`)
    const valid = () => {
      const int = intel.rooms[source.pos.roomName]
      return room.name === source.pos.roomName || (!int.hostile && !int.creeps.find(c => c.hostile))
    }
    createTicket(cgroup, {
      valid,
      count: wantedCarry,
      body: cbody,
      memory: {
        role: 'miningCollector',
        room: room.name,
        stack: [['miningCollector', data.pos, wgroup]]
      }
    })
    createTicket(wgroup, {
      valid,
      count: Math.ceil(5 / wantedWork),
      body: wbody,
      memory: {
        role: 'miningWorker',
        room: room.name,
        stack: [['miningWorker', data.pos]]
      }
    })
  }
  for (const room of rooms) {
    if (!room.controller || room.controller.level === 0) continue
    if (room.controller && !room.controller.my) continue
    const group = `workers${room.name}`
    const reps = Math.floor((room.energyAvailable - 100) / 150)
    const body = [MOVE, CARRY]
    if (!reps) continue
    for (let i = 0; i < reps; i++) {
      if (room.controller.level >= 4 && i % 2 === 1) {
        body.push(MOVE, CARRY)
      } else {
        body.push(MOVE, WORK)
      }
    }
    createTicket(group, {
      // count: room.controller.level >= 4 ? 10 : 6,
      count: 6,
      body,
      memory: {
        role: 'worker',
        room: room.name
      }
    })
    if (room.controller.level >= 3 && room.energyAvailable >= 550) {
      createTicket(`scouts_${room.name}`, {
        valid: () => Game.rooms[room.name].controller.level >= 3,
        body: [MOVE, TOUGH],
        memory: {
          role: 'scout'
        },
        count: 10 + Math.min(intel.outdated.length, 10)
      })
    }
  }
  for (const spawn of spawns) {
    if (spawn.spawning) continue
    const room = spawn.room
    const queue = spawnQueue[room.name]
    while (queue.length) {
      const [{ name, body, cost, memory } = {}] = spawnQueue[room.name].splice(0, 1)
      console.log(name, cost, spawn.room.energyAvailable)
      if (!name) continue
      if (spawn.room.energyAvailable < cost) continue
      log.info(`${spawn.room.name} Spawning ${name} ${memory.group}`)
      // spawn.spawnCreep(body, name, { memory })
      break
    }
  }
}

export default {
  tick,
  census
}

function expandBody (body) {
  let cnt = 1
  const ret = []
  for (const i in body) {
    const t = body[i]
    if (typeof t === 'number') {
      cnt = t
    } else {
      for (let ii = 0; ii < cnt; ii++) {
        ret.push(t)
      }
    }
  }
  return ret
}
