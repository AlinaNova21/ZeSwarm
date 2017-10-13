const census = require('census')
const C = require('constants')
const hostileTracker = require('HostileTracker')

class Spawn {
  get firstHostile () {
    let room = _.find(hostileTracker.getRooms(), r => r.hostile && !r.towers)
    return room
  }
  constructor () {
    this.seedRange = 10
    this.seed = Math.floor(Math.random() * this.seedRange)
  }
  run (spawn) {
    let room = spawn.room
    if (spawn.spawning) return
    if (room.energyAvailable < 50) return
    let want = {}
    let cost = room.energyAvailable
    let have = (census.rooms[room.name] && census.rooms[room.name].roles) || {}
    let hostileConSites = room.find(C.FIND_HOSTILE_CONSTRUCTION_SITES)
    if (hostileConSites.length) {
      want.stomper = 1
    }
    switch (room.controller.level) {
      case 1:
        // want.harv = 4
        want.up = 3
        // want.scout = 4
        break
      case 2:
        want.harv = 2
        // want.scout = 1
        want.build = 4
        want.up = 5
        want.scout = 4
        break
      default:
      case 3:
        want.harv = 4
        want.build = 4
        want.up = 0
        want.scout = 8
	      want.cart = 1
        break
    }
    if (room.controller.level >= 3 && _.size(this.firstHostile)) {
      let h = this.firstHostile
      if (h.safemode < 100) {
        if (h.towers) {
          // want.suicide = 12
        } else {
          want.atk = 5
          want.drainer = 2
          console.log(JSON.stringify(h))
        }
      }
    }
    if (Game.gcl.level > _.filter(Game.rooms, 'my').length && room.controller.level >= 3) {
      want.claim = 1
    }
    let types = Object.keys(want)
    _.sortBy(types, t => {
      if (t === 'suicide') return 100
      if (t === 'scout') return 9
      return 10
    })
    console.log(JSON.stringify(want))
    let sbody = []
    let spriority = -100
    let stype = ''
    let scost = 0
    for (let i = 0; i < types.length; i++) {
      let type = types[i]
      let amount = want[type] - (have[type] || []).length
      let body = []
      let priority = 0
      let bcost = cost
      if (amount <= 0) continue
      switch (type) {
        case 'harv':
          priority = 10
          if (amount === want[type]) priority = 100
          if (priority < 100) bcost = room.energyCapacityAvailable
          body = buildCreepBody(bcost, [C.WORK, C.CARRY], [C.CARRY, C.WORK], {
            maxWork: 6,
            minWork: 1,
            maxCarry: 2
          })
          break
        case 'build':
        case 'up':
          priority = type === 'up' ? 1 : 2
          if (amount === want[type]) priority = 100
          if (priority < 100) bcost = room.energyCapacityAvailable
          body = buildCreepBody(bcost, [C.WORK, C.CARRY], [C.CARRY, C.WORK])
          break
        case 'cart':
          priority = 5
          body = buildCreepBody(bcost, [C.CARRY], [C.CARRY], { minCarry: 2, maxCarry: 40 })
          break
        case 'scout':
        case 'stomper':
          priority = 10
          body = [C.MOVE, C.TOUGH]
          break
        case 'atk':
          body = [C.MOVE, C.RANGED_ATTACK]
          break
        case 'drainer':
          body = [C.WORK, C.TOUGH, C.HEAL, C.MOVE, C.MOVE]
          break
        case 'suicide':
          body = [C.MOVE, C.MOVE, C.TOUGH, C.TOUGH, C.TOUGH, C.TOUGH, C.TOUGH, C.TOUGH, C.TOUGH, C.TOUGH, C.TOUGH, C.TOUGH]
          break
        case 'claim':
          body = [C.MOVE, C.CLAIM]
          continue
          break
      }
      if (!body || !body.length) continue
      body = sortBody(body)
      if (body && body.length && priority > spriority) {
        sbody = body
        spriority = priority
        stype = type
        scost = bcost || cost
      }
    }
    console.log(spriority,stype,scost)
    if (spriority < 100 && Game.time % this.seedRange !== this.seed) return
    if (sbody && sbody.length) {
      let ret = spawn.createCreep(sbody, stype + uid(), { homeRoom: room.name, role: stype })
      console.log(ret, sbody, room.energyAvailable, scost, room.energyCapacityAvailable)
    }
  }
}

function buildCreepBody (cost, baseCreep, growParts, opts) {
  let body = baseCreep.slice()
  opts = opts || {}
  let ocost = cost
  let counts = {}
  let maxParts = {}
  let minParts = {}
  let stop = false
  let movePrice = BODYPART_COST[MOVE]
  let moveCount = baseCreep.length * (opts.useRoads?0.5:1)
  let moveCost = ()=>Math.ceil(moveCount) * movePrice
  cost -= baseCreep.reduce((l,v)=>l+BODYPART_COST[v],0)
  cost -= moveCost()
  if(cost <= 0) return []
  baseCreep.forEach(p=>(counts[p] = counts[p] || 0,counts[p]++))
  for(let k in opts){
    let m = k.match(/^m(ax|in)(.+)$/)
    if(m && m[1] == 'ax') maxParts[m[2].toLowerCase()] = opts[k]
    if(m && m[1] == 'in') minParts[m[2].toLowerCase()] = opts[k]
  }
  while(!stop){
    let sc = cost
    growParts.forEach(p=>{
      let needed = BODYPART_COST[p] + BODYPART_COST[MOVE]
      if(stop || cost < needed || Math.ceil(body.length + moveCount) >= 50) {
        stop = true
        return
      }
      if(typeof maxParts[p] != 'undefined' && maxParts[p] <= counts[p]) return
      body.push(p)
      if(p == MOVE) moveCount++
      cost -= BODYPART_COST[p] + (BODYPART_COST[MOVE] * (opts.useRoads?0.5:1))
      moveCount += (opts.useRoads?0.5:1)
      counts[p] = counts[p] || 0
      counts[p]++
    })
    if(sc == cost) break
  }
  // console.log(opts.minCarry,body.filter(p=>p==CARRY).length,cost,ocost)
  for(let k in minParts)
    if(body.filter(p=>p==k).length < minParts[k]) return []
  moveCount = Math.ceil(moveCount)
  if(opts.maxMove)
    moveCount = Math.min(opts.maxMove,moveCount)
  if(opts.minMove)
    moveCount = Math.max(opts.minMove,moveCount)
  for(let i=0;i<moveCount;i++){
    body.push(MOVE)
  }
  return body
}

function sortBody(body,sortForward){
  if (sortForward) {
    body = _.sortBy(body, function (e) {
      switch (e) {
        case TOUGH:
          return -1;
        case ATTACK:
          return 4;
        case RANGED_ATTACK:
          return 3;
        case WORK:
          return 5;
        case CARRY:
          return 6;
        case HEAL:
          return 9;
        case MOVE:
          return 10;
        default:
          return 1;
      }
    });
  } else {
    body = _.sortBy(body, function (e) {
      switch (e) {
        case TOUGH:
          return -1;
        case ATTACK:
          return 4;
        case RANGED_ATTACK:
          return 3;
        case WORK:
          return 5;
        case CARRY:
          return 6;
        case HEAL:
          return 9;
        case MOVE:
          return 0;
        default:
          return 10;
      }
    });
  }
  return body
}

function uid() {
  let p1 = Game.time.toString(36)
  let p2 = Math.random().toString(36).slice(-4)
  return p1 + p2
}

let spawn = new Spawn()
StructureSpawn.prototype.run = function(){
  spawn.run(this)
}

module.exports = Spawn
