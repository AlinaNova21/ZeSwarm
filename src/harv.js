class Harv {
  get mem() {
    return this.creep.memory
  }
  run(creep){
    this.creep = creep
    if (creep.carry.energy == creep.carryCapacity) {
      this.mem.mode = 'deposit'
    }
    let mode = this.mem.mode || 'gather'
    if(mode == 'deposit'){
      let tgt = Game.getObjectById(this.mem.tgt)
      if(!tgt){
        let targets = [
          ...(creep.room.structures[STRUCTURE_TOWER] || []),
          ...(creep.room.structures[STRUCTURE_STORAGE] || []),
          ...(creep.room.structures[STRUCTURE_EXTENSION] || []),
          ...(creep.room.structures[STRUCTURE_CONTAINER] || []),
          ...(creep.room.structures[STRUCTURE_SPAWN] || [])
        ]
        let tgt = targets.find(t=>((t.storeCapacity || t.energyCapacity || 50) - (t.store && t.store.energy || t.energy)) >= Math.min(25,creep.carry.energy))
        this.mem.tgt = tgt && tgt.id
      }
      if(tgt){
        if(creep.pos.isNearTo(tgt)){
          creep.transfer(tgt,RESOURCE_ENERGY)
          if(creep.carry.energy == 0){
            this.mem.mode = 'gather'
          }else{
            this.mem.tgt = false
          }
        }else{
          return creep.travelTo(tgt)
        }
      }
    }
    if(mode == 'gather'){
      this.mem.tgt = false
      if(!this.mem.source){
        let sources = creep.room.find(FIND_SOURCES)
        this.mem.source = sources[Math.floor(Math.random()*sources.length)].id
      }
      let tgt = Game.getObjectById(this.mem.source)
      if (creep.pos.isNearTo(tgt)) {
        let cont = creep.pos.lookFor(LOOK_STRUCTURES).find(s=>s.structureType == STRUCTURE_CONTAINER && s.store.energy)
        if(cont) {
          creep.withdraw(cont,RESOURCE_ENERGY)
        } else {
          creep.harvest(tgt)
        }
      }else{
        creep.travelTo(tgt)
      }      
    }
  }
}
module.exports = Harv