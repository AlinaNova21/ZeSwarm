if(!Memory.lastTick)
    Memory.lastTick = Date.now()
var Traveler = require('Traveler');    
let sayings = `
Wandering
Scouting!
Looking|for food
Hello!
Coming|Through
Hunting|rabbits
...
`.split("\n").filter(s=>s)
let shooting = `
🔫PEW PEW🔫
🔫FIRE!!🔫
Get Food
`.split("\n").filter(s=>s)
let psayings = `
Looking|for food|in|USER's|room
Prepare|to be|eaten|USER
Planning|to eat|USER
Scouting|USER
...
`.split("\n").filter(s=>s)
let target = {}
let user = Game.spawns.Spawn1.owner.username
module.exports.loop = function(){
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
    let workers = _.filter(Game.creeps,c=>c.getActiveBodyparts(WORK) && c.getActiveBodyparts(CARRY))
    let ccnt = _.size(Game.creeps)
    vis.text(`${ccnt} alive (${workers.length}W,${ccnt-workers.length}S)`,25,8,{ size: 1 })
    Memory.lastTick = now
    Memory.wn = Memory.wn || 1
    Memory.ledger = Memory.ledger || []
    let ea = Game.spawns.Spawn1.room.energyAvailable
    let sp = Game.spawns.Spawn1.pos
    vis.text(ea,sp.x,sp.y+2.5,{size: 2})
    if(Game.spawns.Spawn1.room.energyAvailable >= 50){
        Memory.ledger = []
        let n = Game.time.toString(36)
        let sw = false
        let nw = false
        let rooms = Object.keys(Game.rooms)
        rooms = _.sortBy(rooms,r => r === Game.spawns.Spawn1.room.name ? 1 : 10)
        _.each(rooms,roomName => { 
            let room = Game.rooms[roomName]
            if (room.controller && !room.controller.my && room.controller.level !== 0) return
            if (!room.controller || room.controller.reservation) return
            room.memory.wn = room.memory.wn || 1
            let w = workers.filter(w=>w.name.split('.')[2] == room.name)
            let mult = room === Game.spawns.Spawn1.room ? 3 : 5
            let wanted = room.find(FIND_SOURCES).length * mult
            if(w.length < wanted){
                if(!sw && Game.spawns.Spawn1.room.energyAvailable >= 200){
                    Game.spawns.Spawn1.createCreep([MOVE,WORK,CARRY],[n,room.memory.wn++,room.name].join('.'))
                    Memory.ledger.unshift(['spawn',room.name])
                    sw = true
                }    
                nw = true
            }
            Memory.ledger.push([room.name,w.length,wanted])
        })
        if(sw || nw){
            Memory.ledger.unshift([`NEXT: worker (${Math.max(0,200-ea)})`])
        }else{
            Memory.ledger.unshift([`NEXT: scout (${Math.max(0,100-ea)})`])
            let body = [MOVE]
            if(Game.flags.target || true){
                body.push(([RANGED_ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,WORK,WORK])[Math.floor(Math.random()*7)])
            }
            Game.spawns.Spawn1.createCreep(body,n)
        }
    }
    
    Memory.ledger.map(l=>l.filter(a=>a !== '').join(', ')).forEach((l,i,a)=>{
        let size = 1.5
        let sc = size
        vis.text(l,0,sc+(i*sc),{ align: 'left', size })
        // vis.text(l,49,sc+(i*sc),{ align: 'right', size })
        // vis.text(l,0,50-(a.length*sc)+(i*sc),{ align: 'left', size })
        // vis.text(l,49,50-(a.length*sc)+(i*sc),{ align: 'right', size })
    })
    _.each(Game.creeps,c=>{
        if(c.getActiveBodyparts(WORK) && c.getActiveBodyparts(CARRY)){
            runWorker(c)
        }else{
            runScout(c)
        }
    })
    _.each(Memory.creeps,(c,name)=>{
        if(!Game.creeps[name]) delete Memory.creeps[name]
    })
    vis.text(`${Game.cpu.getUsed().toFixed(3)} cpu`,25,7,{ size: 1 })
}

function runWorker(c){
    if(c.carry.energy < 50){
        let [,n,roomName] = c.name.split('.')
        if (roomName && c.pos.roomName != roomName)
            return c.travelTo(new RoomPosition(25,25,roomName))
        let srcs = c.room.find(FIND_SOURCES)
        let sn = parseInt(n) % srcs.length
        let src = srcs[sn]
        if(c.pos.isNearTo(src))
            c.harvest(src)
        else
            c.moveTo(src)
    }else{
        if(c.room.controller && c.room.controller.my && c.room.controller.ticksToDowngrade < 15000){
            c.travelTo(c.room.controller)
            c.upgradeController(c.room.controller)
            return
        }
        let s = Game.spawns.Spawn1
        if(c.pos.isNearTo(s)){
            if (c.carry.energy <= (s.energyCapacity - s.energy)) {
                c.transfer(s,RESOURCE_ENERGY)
            }
        } else if (s.energy < s.energyCapacity) {
            c.moveTo(s)
        } else {
            let result = PathFinder.search(c.pos,{ pos: s.pos, range: 3 },{ flee: true })
            if(result && result.path.length){
                c.say('Fleeing')
                return c.moveByPath(result.path)
            }
        }
    }
}

function runScout(c){
    if(Game.cpu.getUsed() >= 90) return
    if(target.room && target.room != c.room.name){
        c.say(`tgt ${target.room}`)    
        return c.travelTo(new RoomPosition(25,25,target.room),{ preferHighway: true })
    }
    let ct = c.room.controller
    if(ct) {
        if(!ct.sign || ct.sign.username != user || !ct.sign.text || (Date.now() - ct.sign.datetime) > 1*60*60*1000) {
            if(c.pos.isNearTo(ct)){
                c.signController(ct,`Territory of ${user}. Intruders will be eaten`)
            }else{
                c.travelTo(ct)
            }
        }
    }
    if(!c.memory.z) c.memory.z = c.notifyWhenAttacked(false)
    let lastdir = c.memory.ld || Math.ceil(Math.random()*8)
    let lp = c.memory.lp || c.pos
    c.memory.lp = { x:c.pos.x,y:c.pos.y }
    let stuck =  lp.x == c.pos.x && lp.y == c.pos.y
    if(stuck) {
        lastdir = Math.ceil(Math.random()*8)
    }
    let dirs = []
    for(let i=0;i<10;i++)
        dirs.push(lastdir)
    if(Math.random()<0.2){
        for(let i=0;i<4;i++)
            dirs.push(lastdir+1,lastdir-1)
        if(Math.random()<0.10){
           dirs.push(lastdir+2,lastdir-2)
        }
    }
    let dir = dirs[Math.floor(Math.random()*dirs.length)]
    let pd = dir
    dir = ((dir+8-1) % 8) + 1
    c.memory.ld = dir
    {
        let target = c.pos.findClosestByRange(FIND_HOSTILE_CREEPS, { filter: c=>c.owner.username != 'Source Keeper' })
        if(target && (!c.room.controller || (c.room.controller && (!c.room.controller.safeMode || c.room.controller.my))) && !c.getActiveBodyparts(WORK)){
            if(target.pos.getRangeTo(c) <= 3){
                let txt = shooting[Math.floor(Math.random()*shooting.length)]
                if(target.pos.isNearTo(c)){
                    if(c.getActiveBodyparts(ATTACK)){
                        c.attack(target)
                    }
                    if(c.getActiveBodyparts(RANGED_ATTACK)){
                        c.rangedAttack(target)
                    }
                    c.move(c.pos.getDirectionTo(target.pos))
                }else{
                    c.rangedAttack(target)
                    c.travelTo(target)
                }
                c.say(txt,true)
            }else{
                c.travelTo(target)
            }
            return
        }
        if(target && target.pos.getRangeTo(c) < 8 ){
            let hostiles = c.room.find(FIND_HOSTILE_CREEPS).filter(c=>c.getActiveBodyparts(ATTACK) + c.getActiveBodyparts(RANGED_ATTACK) > 2)
            let result = PathFinder.search(c.pos,hostiles.map(c=>({ pos: c.pos, range: c.getActiveBodyparts(RANGED_ATTACK)?15:3 })),{ flee: true })
            if(result && result.path.length){
                c.say('Fleeing')
                return c.moveByPath(result.path)
            }
            
        }
    }
    {
        let target = c.pos.findClosestByRange(FIND_STRUCTURES,{ filter(s){ return !s.my && s.structureType != 'controller' } })
        if(target && target.pos.getRangeTo(c) <= 30 && c.room.controller && !c.room.controller.safeMode){
            let towers = c.room.find(FIND_STRUCTURES,{ filter(s){ return s.structureType == 'tower'}}) || []
            if(!towers.length){
                c.room.createFlag(c.pos, 'target',COLOR_RED,COLOR_YELLOW)
            }
            let txt = shooting[Math.floor(Math.random()*shooting.length)]
            if (c.getActiveBodyparts(WORK)){
                c.dismantle(target)
                c.travelTo(target, { offroad: true })
                txt = 'DESTROY'
            }
            if (c.getActiveBodyparts(ATTACK)){
                c.attack(target)
                c.travelTo(target, { offroad: true })
            }
            if (c.getActiveBodyparts(RANGED_ATTACK)){
                c.rangedAttack(target)
            }
            c.say(txt,true)
            return
        }
        if(!target && c.room.controller && Game.flags.target && Game.flags.target.pos.roomName == c.room.name){
            Game.flags.target.remove()
        }
    }
    let csites = c.room.find(FIND_CONSTRUCTION_SITES)
    if(csites.length && Math.random()<0.10){
        c.moveTo(csites[0],{ visualizePathStyle: { opacity: 1 }})
        if(c.memory._move) c.memory.ld = parseInt(c.memory._move.path.slice(4,1))
    }else{
        c.move(dir)
    }
    if(dir <= 0) console.log(pd,dir,dirs)
    if(c.memory.phrase && c.memory.phrase.length){
        let txt = c.memory.phrase.shift()
        c.say(txt,true)
    }
    if(Math.random() > 0.9) {
        let txt = sayings[Math.floor(Math.random()*sayings.length)]
        if(c.room.controller && c.room.controller.owner && c.room.controller.owner.username && c.room.controller.owner.username != 'ags131'){
            let user = c.room.controller.owner.username
            txt = psayings[Math.floor(Math.random()*psayings.length)]
            if(Math.random() > 0.7){
                let smileys = '😀😁😃😄😆😉😊☺️😛😜😝😈'
                txt = smileys.substr(Math.floor(Math.random()*(smileys.length/2))*2,2)
            }
            txt = txt.replace(/USER/,user)
        }
        if(~txt.indexOf('|')){
            ;[txt,...phrase] = txt.split('|')
            c.memory.phrase = phrase
        }
        c.say(txt,true)
    }
}