import { kernel } from '/kernel'
import { Logger } from '/log'

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

kernel.createThread('spawnManagerSpawnThread', spawnManagerSpawnThread())

export function createTicket (name, def) {
  tickets.set(name, def)
  def.cost = def.cost || def.body.reduce((val, part) => val + BODYPART_COST[part], 0)
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
    for (const [name,ticket] of tickets.entries()) {
      const have = (census[name] || []).length
      if (have < ticket.count) {
        needed.push(ticket)
      }
      yield true
    }
    const spawns = {}
    for (const room of Object.values(Game.rooms)) {
      for (const spawn of room.spawns) {
        if (spawn.spawning) continue
        spawns[room.name] = spawns[room.name] || []
        spawns[room.name].push(spawn)
      }
    }
    for (const ticket of needed) {
      const { body, cost, memory, valid } = ticket
      if (typeof valid === 'function' && !valid()) {
        tickets.delete(ticket.group)
        continue
      }
      const spawn = findSpawn(ticket.memory.room, spawns)
      if (!spawn) break
      if (spawn.room.energyAvailable < cost) {
        spawns[spawn.room.name].push(spawn)
        continue
      }
      memory.group = memory.group || ticket.group
      const id = UID()
      log.info(`${spawn.room.name} Spawning ${id} ${memory.group}`)
      spawn.spawnCreep(body, id, { memory })
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
    const roomName = creep.room.name
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
    yield true
  }
}