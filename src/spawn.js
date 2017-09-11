const census = require('census')

class Spawn {
  run(spawn){
    let room = spawn.room
    if(spawn.spawning) return
    if(room.energyAvailable < 50) return
    let want = {}
    let cost = room.energyAvailable
    let have = census.rooms[room.name] && census.rooms[room.name].roles || {}
    let hostileConSites = room.find(FIND_HOSTILE_CONSTRUCTION_SITES)
    let maxSize = false
    if(hostileConSites.length){
      want.stomper = 1
    }
    switch(room.controller.level) {
      case 1:
        want.harv = 4
        want.up = 2
        want.scout = 4
        break
      case 2:
        want.harv = 6
        // want.scout = 1
        want.build = 6
        want.up = 0
        break
      case 3:
        want.harv = 6
        want.build = 5
        want.up = 0
        want.scout = 4
        maxSize = true
        break
    }
    for(let type in want){
      let amount = want[type] - (have[type] || []).length
      let body = []
      if(amount <= 0) continue
      switch(type){
        case 'harv':
          body = buildCreepBody(cost,[WORK,CARRY],[CARRY,WORK], { 
            maxWork: 6,
            minWork: 1,
            maxCarry: 2
          })
          break
        case 'build':
        case 'up':
          body = buildCreepBody(cost,[WORK,CARRY],[CARRY,WORK])
          break
        case 'scout':
        case 'stomper':
          body = [MOVE]
          break
      }
      if(!body || !body.length) continue
      body = sortBody(body)
      let ret = spawn.createCreep(body,type + uid(),{ homeRoom: room.name, role: type })
      console.log(ret,body,room.energyAvailable)
      return
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