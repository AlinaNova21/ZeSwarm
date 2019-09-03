import { kernel, restartThread } from '/kernel'
import { Logger } from '/log'
import C from '/constants'
const log = new Logger('[SpawnManager]')

const tickets = new Map()
export let census = {}

/*
def format:
{
  body: string[][]
  count: number
  memory: {}
}
*/

kernel.createThread('spawnManagerSpawnThread', restartThread(spawnManagerSpawnThread))

export function createTicket (name, def) {
  tickets.set(name, def)
  def.cost = def.cost || def.body.reduce((val, part) => val + C.BODYPART_COST[part], 0)
  def.group = def.group || name
}

export function destroyTicket (name) {
  tickets.delete(name)
}

function UID () {
  return ('C' + Game.time.toString(36).slice(-6) + Math.random().toString(36).slice(-3)).toUpperCase()
}

function * spawnManagerSpawnThread () {
  while (true) {
    const needed = []
    yield * gatherCensus()
    for (const [name, ticket] of tickets.entries()) {
      const have = (census[name] || []).length
      if (have < ticket.count) {
        needed.push(ticket)
      }
    }
    log.info(`Tickets needing creeps: ${needed.length}`)
    // log.info(`Tickets needing creeps: ${needed.length} ${needed.map(t => t.group)}`)
    const spawns = {}
    for (const room of Object.values(Game.rooms)) {
      if (!room.controller || !room.controller.my) continue
      for (const spawn of room.spawns) {
        if (spawn.spawning) continue
        spawns[room.name] = spawns[room.name] || []
        spawns[room.name].push(spawn)
      }
    }
    for (const ticket of needed) {
      const { body, cost, memory, valid } = ticket
      if (typeof valid === 'function' && !valid()) {
        log.info(`Deleting invalid ticket ${ticket.group}`)
        tickets.delete(ticket.group)
        continue
      }
      const spawn = findSpawn(ticket.memory.room, spawns)
      if (!spawn) break
      if (spawn.room.energyAvailable < cost) {
        spawns[spawn.room.name].push(spawn)
        log.info(`Not enough energy to spawn ${ticket.group}. Needed: ${cost} Have: ${spawn.room.energyAvailable} in ${spawn.room.name}`)
        continue
      }
      memory.group = memory.group || ticket.group
      const id = UID()
      if (body.length > 50) {
        log.alert(`${spawn.room.name} body too long! ${body.length} ${id} ${memory.group}`)
      }
      log.info(`${spawn.room.name} Spawning ${id} ${memory.group}`)
      spawn.spawnCreep(body.slice(0, 50), id, { memory })
    }
    yield
  }
}

function findSpawn (tgtRoom, spawns) {
  if (!tgtRoom) tgtRoom = Object.keys(spawns)[0]
  return spawns[tgtRoom] && spawns[tgtRoom].pop()
}

function * gatherCensus () {
  census = {}
  const creeps = Object.values(Game.creeps)
  for (const creep of creeps) {
    const roomName = creep.memory.room || creep.room.name
    if (creep.ticksToLive < 100) continue
    census[roomName] = census[roomName] || {}
    if (creep.memory.group) {
      census[creep.memory.group] = census[creep.memory.group] || []
      census[creep.memory.group].push(creep)
      census[roomName][creep.memory.group] = census[roomName][creep.memory.group] || []
      census[roomName][creep.memory.group].push(creep)
    }
    if (creep.memory.role) {
      census[creep.memory.role] = census[creep.memory.role] || []
      census[creep.memory.role].push(creep)
      census[roomName][creep.memory.role] = census[roomName][creep.memory.role] || []
      census[roomName][creep.memory.role].push(creep)
    }
  }
}
