// TODO: completely rework this

import InterShardSegment from '../../InterShardSegment'

Memory.rooms = Memory.rooms || {}

let subRoles = {
  claimer, builder
}

let settlerCount = 0

function runSettler (creep) {
  if (creep.spawning) return
  if (creep.name.slice(0, 7) !== 'settler') return
  settlerCount++
  let [ , shard, room ] = creep.name.split('_')
  console.log(`<h4>${room} ${shard} ${creep.memory.subRole} ${creep.pos}</h4>`)
  if (creep.room.name !== room) {
    return travelTo(creep, new RoomPosition(25, 25, room), { shard })
  } else {
    if (!creep.memory.subRole) {
      if (creep.getActiveBodyparts(CLAIM)) {
        creep.memory.subRole = 'claimer'
      } else {
        creep.memory.subRole = 'builder'
      }
    }
    subRoles[creep.memory.subRole](creep)
  }
}

function claimer (creep) {
  if (creep.pos.isNearTo(creep.room.controller)) {
    creep.claimController(creep.room.controller)
    creep.signController(creep.room.controller, 'Bootstrapping a multi-codebase empire')
  } else {
    creep.say('Claiming!', true)
    travelTo(creep, creep.room.controller)
  }
}

function builder (creep) {
  let mode = creep.memory.mode || 'harvest'
  let swap = (mode) => {
    creep.memory.mode = mode
    builder(creep)
  }
  let etargets = creep.room.find(FIND_HOSTILE_STRUCTURES)
  switch (mode) {
    case 'destroy':
      let [target] = etargets
      if (target) {
        if (creep.pos.isNearTo(target)) {
          creep.dismantle(target)
        } else {
          travelTo(creep, target)
        }
      } else {
        return swap('build')
      }
      break
    case 'harvest':
      if (etargets.length) {
        return swap('destroy')
      }
      if (creep.carry.energy === creep.carryCapacity) {
        return swap('build')
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
      let ind = parseInt(creep.name.split('_')[4], 36)
      let sources = creep.room.find(FIND_SOURCES)
      let source = sources[ind % sources.length]
      if (creep.pos.isNearTo(source)) {
        creep.harvest(source)
      } else {
        travelTo(creep, source)
      }
      break
    case 'fill':
      if (creep.carry.energy === 0) {
        return swap('harvest')
      }
      let [spawn] = creep.room.find(FIND_MY_SPAWNS)
      if (creep.pos.isNearTo(spawn)) {
        creep.transfer(spawn,RESOURCE_ENERGY)
      } else {
        travelTo(creep, spawn)
      }
      break
    case 'build':
      if (creep.carry.energy === 0) {
        return swap('harvest')
      }
      let csites = creep.room.find(FIND_MY_CONSTRUCTION_SITES)
      let csite = csites.find(c => c.type === STRUCTURE_SPAWN || c.structureType === STRUCTURE_SPAWN) || csites[0]
      if (csite) {
        if (creep.pos.inRangeTo(csite, 3)) {
          creep.build(csite)
        } else {
          travelTo(creep, csite)
        }
      } else {
        let [spawn] = creep.room.find(FIND_MY_SPAWNS)
        if (spawn) {
          return swap('fill')
        }
        // creep.memory.homeRoom = creep.room.name
        // creep.memory.mode = 'upgrade'
        // creep.memory.role = 'upgrader'
        // creep.runUpgrader()
      }
      break
  }
}

function travelTo (creep, x, y, roomName, opts = {}) {
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
      let target = XYToRoom(x, y)
      if (creep.room.name !== target) {
        pos = new RoomPosition(25, 25, target)
        creep.say(`S ${target}`)
      } else {
        let [portal] = creep.room.find(FIND_STRUCTURES, { filter (s) { return s.structureType === 'portal' && s.destination.shard === opts.shard }}) || []
        if (portal) {
          pos = portal.pos
          creep.say(`P ${pos.x} ${pos.y}`)
        }
      }
    }
  }
  Object.assign({

  }, opts)
  console.log(pos, opts)
  return creep.moveTo(pos, opts)
  return Traveler.travelTo(creep, pos, opts)
}

function roomToXY (room) {
  let [, dx, x, dy, y] = room.match(/^(.)(\d+)(.)(\d+)$/)
  x = parseInt(x)
  y = parseInt(y)
  if (dx === 'W') x = (x * -1) - 1
  if (dy === 'S') y = (y * -1) - 1
  return { x, y }
}

function XYToRoom (x, y) {
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

export default function* Generic() {
  while(true) {
    loop()
    yield
  }
}

function loop () {
  // settlerCount = 0
  console.log('Bootstrap: loop')
  InterShardSegment.local.creeps = _.size(Game.creeps)// settlerCount
  _.each(Game.creeps, runSettler)
  if (Game.flags.bootstrap_spawn) {
    let flag = Game.flags.bootstrap_spawn
    if (!InterShardSegment.local.spawns) {
      flag.pos.createConstructionSite(STRUCTURE_SPAWN)
    }
  }
  if (Game.flags.bootstrap) {
    let bs = Game.flags.bootstrap
    if (!bs.memory.shard || !bs.memory.room || !bs.memory.src) {
      console.log('Need shard, room and src')
      return
    }
    let sd = InterShardSegment.remote[bs.memory.shard]
    {
      let { creeps = 0, spawns = 0 } = sd
      console.log(`Bootstrap: Creeps: ${creeps} Spawns: ${spawns}`)
      if (creeps >= 8) return
      if (spawns) return
    }
    let r = Game.rooms[bs.memory.src]
    let spawns = r.find(FIND_MY_SPAWNS)
    let spawn = _.find(spawns, s => !s.spawning)
    if (!spawn) return
    bs.memory.cnt = bs.memory.cnt || 0
    let ind = bs.memory.cnt % 3
    let body = []
    if (ind === 0) { // && !sd.rooms) {
      body = [CLAIM, MOVE]
      bs.memory.claimed = true
    } else {
      let cnt = Math.floor(r.energyAvailable / 200)
      for (let i = 0; i < cnt; i++) {
        body.push(MOVE, MOVE, WORK, CARRY)
      }
      body = body.slice(0, 30)
    }
    let name = `settler_${bs.memory.shard}_${bs.memory.room}_${ind}_${Math.random().toString(36).slice(-4)}`
    let ret = spawn.createCreep(body, name)
    if (typeof ret === 'string') {
      console.log('Settler spawned', ret)
      bs.memory.cnt++
    } else {
      console.log('Settler spawn failed', ret)
    }
  }
}
