import { kernel, sleep } from '../kernel'
import InterShardRPC from '../InterShardRPC'
import InterShardSegment from '../InterShardSegment'

kernel.createProcess('Settler', Settler)

function * Settler () {
  const threads = [
    ['creepMonitor', creepMonitor],
    ['manageSettlers', manageSettlers]
  ]
  while(true) {
    for (const thread of threads) {
      if (!this.hasThread(thread[0])) {
        this.createThread(...thread)
      }
    }
    yield * sleep(10)
  }
}

function * creepMonitor () {
  while (true) {
    for (const creepName in Game.creeps) {
      if (!creepName.startsWith('settler')) continue
      if (!this.hasThread(`creep:${creepName}`)) {
        this.createThread(`creep:${creepName}`, runSettler, creepName)
      }
    }
    yield
  }
}


function * runSettler(creepName) {
  const creep = Game.creeps[creepName]
  if (!creep) return
  if (creep.spawning) return
  const [, shard, room] = creep.name.split('_')
  while (Game.creeps[creepName] && Game.creeps[creepName].pos.roomName !== room) {
    const creep = Game.creeps[creepName]
    if (!creep) return // Either died or went through a portal
    this.log.info(`Settler ${creep.name} ${shard}:${room} ${creep.pos}`)
    travelTo(creep, new RoomPosition(25, 25, room), { shard })
    creep.say(`goto ${room}`)
    yield
  }
  if (creep.getActiveBodyparts(CLAIM)) {
    yield * claimer(creepName)
  } else {
    yield * builder(creepName)
  }
}

function * claimer(creepName) {
  while(true) {
    const creep = Game.creeps[creepName]
    if (!creep) return
    if (creep.pos.isNearTo(creep.room.controller)) {
      if (creep.room.controller.reservation) {
        yield
      }
      creep.claimController(creep.room.controller)
      creep.signController(creep.room.controller, 'Bootstrapping a multi-codebase empire')
      creep.suicide()
      return
    } else {
      creep.say('Claiming!', true)
      travelTo(creep, creep.room.controller)
    }
    yield
  }
}

function * builder(creepName) {
  let mode = 'harvest'
  while(true) {
    const creep = Game.creeps[creepName]
    if (!creep) return

    const etargets = creep.room.find(FIND_HOSTILE_STRUCTURES)
    switch (mode) {
      case 'destroy':
        const [target] = etargets
        if (target) {
          if (creep.pos.isNearTo(target)) {
            creep.dismantle(target)
          } else {
            travelTo(creep, target)
          }
        } else {
          mode = 'build'
          continue
        }
        break
      case 'harvest':
        if (etargets.length) {
          mode = 'destroy'
          continue
        }
        if (creep.carry.energy === creep.carryCapacity) {
          mode = 'build'
          continue
        }
        const [dropped] = creep.room.find(FIND_DROPPED_RESOURCES)
        if (dropped) {
          if (creep.pos.isNearTo(dropped)) {
            creep.pickup(dropped)
          } else {
            travelTo(creep, dropped)
          }
          return
        }
        const ind = parseInt(creep.name.split('_')[3], 36)
        const sources = creep.room.find(FIND_SOURCES)
        const source = sources[ind % sources.length]
        if (creep.pos.isNearTo(source)) {
          creep.harvest(source)
        } else {
          travelTo(creep, source)
        }
        break
      case 'fill':
        if (creep.carry.energy === 0) {
          mode = 'harvest'
          continue
        }
        const [spawn] = creep.room.find(FIND_MY_SPAWNS)
        if (creep.pos.isNearTo(spawn)) {
          creep.transfer(spawn, RESOURCE_ENERGY)
        } else {
          travelTo(creep, spawn)
        }
        break
      case 'build':
        if (creep.carry.energy === 0) {
          mode = 'harvest'
          continue
        }
        const csites = creep.room.find(FIND_MY_CONSTRUCTION_SITES)
        const csite = csites.find(c => c.type === STRUCTURE_SPAWN || c.structureType === STRUCTURE_SPAWN) || csites[0]
        if (csite) {
          if (creep.pos.inRangeTo(csite, 3)) {
            creep.build(csite)
          } else {
            travelTo(creep, csite)
          }
        } else {
          const [spawn] = creep.room.find(FIND_MY_SPAWNS)
          if (spawn) {
            mode = 'fill'
            continue
          }
          // creep.memory.homeRoom = creep.room.name
          // creep.memory.mode = 'upgrade'
          // creep.memory.role = 'upgrader'
          // creep.runUpgrader()
        }
        break
    }
    yield
  }
}

function travelTo(creep, x, y, roomName, opts = {}) {
  if (creep.fatigue > 0) return
  let pos
  if (typeof y !== 'number') {
    opts = y || {}
    pos = x.pos || x
  } else {
    pos = new RoomPosition(x, y, roomName)
  }
  if (opts.shard && Game.shard) {
    if (Game.shard.name !== opts.shard) {
      let { x, y } = roomToXY(creep.room.name)
      x = Math.round(x / 10) * 10
      y = Math.round(y / 10) * 10
      const target = XYToRoom(x, y)
      if (creep.room.name !== target) {
        pos = new RoomPosition(25, 25, target)
        creep.say(`S ${target}`)
      } else {
        const [portal] = creep.room.find(FIND_STRUCTURES, { filter(s) { return s.structureType === 'portal' && s.destination.shard === opts.shard } }) || []
        if (portal) {
          pos = portal.pos
          creep.say(`P ${pos.x} ${pos.y}`)
        }
      }
    }
  }
  return creep.moveTo(pos, opts)
  return Traveler.travelTo(creep, pos, opts)
}

function roomToXY(room) {
  let [, dx, x, dy, y] = room.match(/^(.)(\d+)(.)(\d+)$/)
  x = parseInt(x)
  y = parseInt(y)
  if (dx === 'W') x = (x * -1) - 1
  if (dy === 'S') y = (y * -1) - 1
  return { x, y }
}

function XYToRoom(x, y) {
  let dx = 'E'
  let dy = 'N'
  if (x < 0) {
    x = (x + 1) * -1
    dx = 'W'
  }
  if (y < 0) {
    y = (y + 1) * -1
    dy = 'S'
  }
  return `${dx}${x}${dy}${y}`
}

InterShardRPC.expose('spawnSettler', spawnSettler)

function * spawnSettler (srcRoom, dstShard, dstRoom, role) {
  while(true) {
    const room = Game.rooms[srcRoom]
    const spawns = room.find(FIND_MY_SPAWNS)
    const spawn = _.find(spawns, s => !s.spawning)
    if (!spawn) {
      this.log.warn('Waiting for spawn to become available')
      yield
      continue
    }
    let body = []
    if (role === 'claimer') {
      body.push(CLAIM, MOVE)
    } else {
      const cnt = Math.floor(room.energyAvailable / 200)
      for (let i = 0; i < cnt; i++) {
        body.push(MOVE, MOVE, WORK, CARRY)
      }
      body = body.slice(0, 30)
    }
    const name = `settler_${dstShard}_${dstRoom}_${Math.random().toString(36).slice(-4)}`
    const ret = spawn.spawnCreep(body, name)
    if (ret === OK) {
      this.log.warn(`Settler spawned ${name}`)
      return name
    } else {
      throw new Error(`Settler spawn failed ${ret}`)
    }
  } 
}

function * manageSettlers () {
  while (true) {
    const bs = Game.flags.bootstrap
    const mem = InterShardSegment.local
    if (bs) {
      mem.bootstrap = Object.assign({}, bs.memory)
    }
    if (!mem.bootstrap) {
      yield
      continue
    }
    const { shard, room, src } = mem.bootstrap
    if (!shard || !room || !src) {
      this.log.warn('Need shard, room and src')
      yield
      continue
    }
    const rpc = new InterShardRPC(shard)
    mem.creeps = mem.creeps || []
    if (!bs.room || !bs.room.controller.my) {
      this.log.warn('Spawning claimer')
      const name = yield * rpc.call('spawnSettler', src, Game.shard.name, room, 'claimer')
      while (!Game.creeps[name]) {
        this.log.warn('Waiting for claimer to arrive')
        yield
      }
      while (Game.creeps[name]) { 
        this.log.warn('Waiting for claimer to finish')
        yield
      }
    }
    while (mem.creeps.length < 3) {
      this.log.warn('Spawning builder')
      const name = yield * rpc.call('spawnSettler', src, Game.shard.name, room, 'builder')
      mem.creeps.push(name)
    }
    mem.hasSeen = []
    mem.creeps = mem.creeps.filter(creepName => {
      const creep = Game.creeps[creepName]
      const mustLive = mem.hasSeen.includes(creepName)
      if (!mustLive && creep) mem.hasSeen.push(creepName)
      if (mustLive && !creep) return false
      return creep && creep.ticksToLive > 100 && creep.hits === creep.hitsMax
    })
    mem.hasSeen = mem.hasSeen.filter(n => mem.creeps.includes(n))
    yield
  }
}
