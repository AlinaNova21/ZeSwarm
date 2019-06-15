const StackState = require('./StackState')
require('./prototypes.room')
require('./Traveler')
const layout = require('./layout')
const manager = require('./manager')
const intel = require('./Intel')
const log = require('./log')
if (!Memory.lastTick) {
  Memory.lastTick = Date.now()
}

module.exports.loop = function(){
  intel.collect()
  target = { name: '', room: Game.flags.target && Game.flags.target.pos.roomName } 
  let now = Date.now()
  let lt = Memory.lastTick
  let vis = new RoomVisual()
  let t = now - lt
  let n = Memory.avgCnt || 1
  let avg = Memory.avg || t
  avg = avg + (t - avg) / ++n
  Memory.avg = avg
  Memory.avgCnt = n
  vis.text(`Tick Timing ${(t/1000).toFixed(3)}s`,25,3,{ size: 3 })
  vis.text(`Avg ${(avg/1000).toFixed(3)}s`,25,6,{ size: 3 })
  console.log(`Tick Timing ${(t/1000).toFixed(3)}s`)
  console.log(`Avg ${(avg/1000).toFixed(3)}s`)
  let workers = _.filter(Game.creeps,c=>c.getActiveBodyparts(WORK) && c.getActiveBodyparts(CARRY))
  let scouts = _.filter(Game.creeps,c=>!c.getActiveBodyparts(CARRY))
  let ccnt = _.size(Game.creeps)
  vis.text(`${ccnt} alive (${workers.length}W,${ccnt-workers.length}S)`,25,8,{ size: 1 })
  console.log(`${ccnt} alive (${workers.length}W,${ccnt-workers.length}S)`)
  Memory.census = {
    workers,
    scouts,
  }
  Memory.lastTick = now
  Memory.wn = Memory.wn || 1
  Memory.ledger = Memory.ledger || []
  let ea = Game.spawns.Spawn1.room.energyAvailable
  let sp = Game.spawns.Spawn1.pos
  vis.text(ea,sp.x,sp.y+0.5,{size: 0.7})
  const { energyAvailable, energyCapacityAvailable } = Game.spawns.Spawn1.room
  if(energyAvailable >= 50){
    Memory.ledger = []
    let n = Game.time.toString(36)
    let sw = false
    let nw = false
    let rooms = Object.keys(Game.rooms)
    rooms = _.sortBy(rooms,r => r === Game.spawns.Spawn1.room.name ? 1 : 10)
    const homeRoom = Game.spawns.Spawn1.room
    const hostiles = homeRoom.find(FIND_HOSTILE_CREEPS)
    if (hostiles.length) {
      homeRoom.towers.forEach(tower => {
        const closest = tower.pos.findClosestByRange(hostiles)
        tower.attack(closest)
      })
    }
    const homeRoomExits = [] //_.values(Game.map.describeExits(homeRoom.name))
    _.each(rooms,roomName => { 
      let room = Game.rooms[roomName]
      if (room.controller && !room.controller.my && !homeRoomExits.includes(room.name)) return // No remotes for now
      if (room.controller && !room.controller.my && room.controller.level !== 0) return
      if (!room.controller || room.controller.reservation) return
      const spawns = room.spawns.filter(s => !s.spawning)
      if (!spawns.length) return
      room.memory.wn = room.memory.wn || 1
      let w = workers.filter(w=>w.name.split('.')[2] == room.name)
      let mult = room === Game.spawns.Spawn1.room ? (room.controller.level < 3 ? 6 : 3) : 5
      let wanted = 2 //room.find(FIND_SOURCES).length * mult
      let miners = room.find(FIND_MY_CREEPS).filter(c => c.memory.group).length
      const cont = room.spawns[0].pos.findClosestByRange(room.containers)
      if (room.controller.level === 1) wanted = 6
      if (room.controller.level > 1 && room.controller.level <= 3) wanted = miners >= 6 && cont ? Math.max(6, 80 / (room.extensions.length > 5 ? room.extensions.length : 5)) : 6
      // if (room.controller.level === 3) wanted = 5
      if (room.controller.level === 4) wanted = 15
      if(w.length < wanted){
        console.log(energyAvailable, energyCapacityAvailable)
        if(!sw && (energyAvailable > energyCapacityAvailable * 0.6 || w.length < wanted / 2)){
          const body = [CARRY,MOVE]
          const baseCost = BODYPART_COST[CARRY] + BODYPART_COST[MOVE]
          const addCost = BODYPART_COST[WORK] + BODYPART_COST[MOVE]
          const rep = Math.floor((energyAvailable - baseCost) / addCost)
          if (rep) {
            let cost = baseCost;
            let i=0;
            while (true) {
              i++
              const part = i % 2 === 1 ? WORK : CARRY
              const aCost = BODYPART_COST[part] + BODYPART_COST[MOVE]
              if (cost + aCost > energyAvailable) break
              cost += aCost
              body.push(part, MOVE)
            }
            log.info("Spawning worker")
            spawns[0].spawnCreep(body,[n,room.memory.wn++,room.name].join('.'), { 
              memory: {
                role: 'worker',
                stack: [['worker']]
              }
            })
            Memory.ledger.unshift(['spawn',room.name])
            sw = true
          } else {
            console.log('failed to build worker')
          }
        }    
        nw = true
      }
      Memory.ledger.push([room.name,w.length,wanted])
    })
    const allowScouts = homeRoom.controller.level >= 3 && !nw && !sw && energyAvailable === energyCapacityAvailable
    if(sw || nw){
      Memory.ledger.unshift([`NEXT: worker (${Math.max(0,(energyCapacityAvailable * 0.6) - energyAvailable)})`])
    }else if (allowScouts && (Math.random() < 0.05 || energyAvailable >= energyCapacityAvailable - 200)) {
      Memory.ledger.unshift([`NEXT: scout (${Math.max(0,(energyCapacityAvailable * 0.6) - energyAvailable)})`])
      let body = [MOVE]
      if(Game.flags.target || true){
      }
      log.info("Spawning scout")
      // spawns[0].spawnCreep(body, n, {
      //   memory: {
      //     role: 'scout',
      //     stack: [['scout']]
      //   }
      // })
    }
    manager.tick()
    layout.run()
  }
  
  Memory.ledger.map(l=>l.filter(a=>a !== '').join(', ')).forEach((l,i,a)=>{
    let size = 1.5
    let sc = size
    vis.text(l,0,sc+(i*sc),{ align: 'left', size })
  })
  _.each(Game.creeps, c=>{
    try {
      StackState.runCreep(c)
    }catch(e) {
      log.error(`Creep ${c} failed to run ${e.stack}`)
    }
  })
  _.each(Memory.creeps,(_,name)=>{
    if(!Game.creeps[name]) delete Memory.creeps[name]
  })
  vis.text(`${Game.cpu.getUsed().toFixed(3)} cpu`,25,7,{ size: 1 })
}
