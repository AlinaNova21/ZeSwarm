import { kernel, restartThread } from '/kernel'
import { Logger } from '/log'
import C from '/constants'
import { Tree } from '/lib/Tree'
import sortedIndexBy from 'lodash/sortedIndexBy'

const log = new Logger('[SpawnManager]')

const tickets = new Map()
export let census = {}
const tree = new Tree()
/*
def format:
{
  body: string[][]
  count: number
  memory: {}
}
*/

kernel.createThread('spawnManagerSpawnThread', restartThread(spawnManagerSpawnThreadV2))

export function createTicket (name, def) {
  tickets.set(name, def)
  def.cost = def.cost || (def.body && def.body.reduce((val, part) => val + C.BODYPART_COST[part], 0)) || 0
  def.group = def.group || name
  const node = tree.nodes[name] || tree.newNode(name, def.parent || 'root')
  node.weight = def.weight || 0
  node.treeWeight = node.weight + (tree.nodes[node.parent].treeWeight || 0)
}

export function destroyTicket (name) {
  tickets.delete(name)
  tree.walkNode(name, node => {
    for (const child of node.children) {
      delete tree.nodes[child]
      tickets.delete(child)
    }
    delete tree.nodes[node.id]
  })
}

function UID () {
  return ('C' + Game.time.toString(36).slice(-6) + Math.random().toString(36).slice(-3)).toUpperCase()
}

function * spawnManagerSpawnThreadV2 () {
  while (true) {
    yield * gatherCensus()
    log.info(JSON.stringify(tree))
    for (const node of Object.values(tree.nodes)) {
      log.info(`${node.treeWeight} ${node.id} ${node.parent}`)
    }
    for (const room of Object.values(Game.rooms)) {
      if (!room.controller || !room.controller.my) continue
      createTicket(`room_${room.name}`, { needed: 0, cost: 0, parent: 'root' })
    }
    // tree.calcWeight()
    for (const room of Object.values(Game.rooms)) {
      if (!room.controller || !room.controller.my) continue
      const needed = []
      createTicket(`room_${room.name}`, { needed: 0, cost: 0, parent: 'root' })
      tree.walkNode(`room_${room.name}`, node => {
        const t = tickets.get(node.id)
        if (typeof t.valid === 'function' && !t.valid()) {
          log.info(`Deleting invalid ticket ${t.group}`)
          tickets.delete(t.group)
          return
        }
        if (!t.cost) return // Skip 'virtual' tickets
        const have = (census[node.id] || []).length
        if (have < t.count) {
          const ind = sortedIndexBy(needed, node, 'treeWeight')
          needed.splice(ind, 0, node)
        }
      })
      for (const spawn of room.spawns) {
        if (!needed.length) break
        if (spawn.spawning) continue
        const n = needed.pop()
        const t = tickets.get(n.id)
        if (room.energyAvailable < t.cost) {
          log.info(`Not enough energy to spawn ${t.group}. Needed: ${t.cost} Have: ${room.energyAvailable} in ${room.name}`)
          break
        }
        const memory = t.memory
        memory.group = memory.group || t.group
        const id = UID()
        if (t.body.length > 50) {
          log.alert(`${room.name} body too long! ${t.body.length} ${id} ${t.memory.group}`)
        }
        log.info(`${room.name} Spawning ${id} ${memory.group}`)
        const ret = spawn.spawnCreep(t.body.slice(0, 50), id, { memory })
        if (ret === C.OK) {
          room.energyAvailable -= t.cost
        }
      }
    }
    yield
  }
}

function * spawnManagerSpawnThreadV1 () {
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
      if (!spawn) continue
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
