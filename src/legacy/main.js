require('./creep')
const C = require('./constants')
const hostileTracker = require('./HostileTracker')

if(!Room.prototype.structures)
Object.defineProperty(Room.prototype, 'structures', {
  get: function() { 
    if(!this._structures || _.isEmpty(this._structures)) {
      this._all_structures = this.find(FIND_STRUCTURES)
      this._structures = _.groupBy(this._all_structures, 'structureType');
      this._structures.all = this._all_structures
    }
    return this._structures;
  },
  enumerable: false,
  configurable: true
});  

if(!Memory.lastTick)
    Memory.lastTick = Date.now()
const Scout = require('./scout')
const scout = new Scout()
var Traveler = require('./Traveler');    
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
let user = (Game.spawns.Spawn1 || _.find(Game.creeps, c=>c)).owner.username || 'ZeSwarm'
C.USER = user

module.exports.loop = function(){
    hostileTracker.tick()
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
    // vis.text(`Tick Timing ${(t/1000).toFixed(3)}s`,25,3,{ size: 3 })
    // vis.text(`Avg ${(avg/1000).toFixed(3)}s`,25,6,{ size: 3 })
    let workers = _.filter(Game.creeps,c=>c.getActiveBodyparts(WORK) && c.getActiveBodyparts(CARRY))
    let ccnt = _.size(Game.creeps)
    // vis.text(`${ccnt} alive (${workers.length}W,${ccnt-workers.length}S)`,25,8,{ size: 1 })
    Memory.lastTick = now
    Memory.wn = Memory.wn || 1
    Memory.ledger = Memory.ledger || []
    // let ea = Game.spawns.Spawn1.room.energyAvailable
    // let sp = Game.spawns.Spawn1.pos
    // vis.text(ea,sp.x,sp.y+2.5,{size: 2})
    Memory.ledger.map(l=>l.filter(a=>a !== '').join(', ')).forEach((l,i,a)=>{
        let size = 1.5
        let sc = size
        vis.text(l,0,sc+(i*sc),{ align: 'left', size })
        // vis.text(l,49,sc+(i*sc),{ align: 'right', size })
        // vis.text(l,0,50-(a.length*sc)+(i*sc),{ align: 'left', size })
        // vis.text(l,49,50-(a.length*sc)+(i*sc),{ align: 'right', size })
    })
    _.each(Memory.creeps,(c,name)=>{
        if(!Game.creeps[name]) delete Memory.creeps[name]
    })
    _.invoke(Game.structures,'run')
    _.invoke(Game.creeps,'run')    
    vis.text(`${Game.cpu.getUsed().toFixed(3)} cpu`,25,0.5,{ size: 1 })
}

let protoCache = {}
RoomObject.prototype.run = function(){
    if (this instanceof Creep) this.structureType = 'creep'
    if(protoCache[this.structureType] === false) return
    if(protoCache[this.structureType]) {
        protoCache[this.structureType].run(this)
    } else {
        try{
            let c = require(this.structureType)
            protoCache[this.structureType] = new c()
        }catch(e){
            console.log(`Could not find handler for ${this.structureType} ${e.stack}`)
            protoCache[this.structureType] = false
        }
    }
}
