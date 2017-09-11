class Build {
  get mem() {
    return this.creep.memory
  }
  run(creep){
    this.creep = creep
    if (creep.carry.energy == 0) {
      this.mem.tgt = false
      let [tgt] = [
        ...(creep.room.structures[STRUCTURE_STORAGE] || []),
        ...(creep.room.structures[STRUCTURE_CONTAINER] || []),
        ...(creep.room.structures[STRUCTURE_SPAWN] || [])
      ].filter(s => s.store && s.store.energy || s.energy)
      if(tgt){
        if(creep.pos.isNearTo(tgt)){
          creep.withdraw(tgt,RESOURCE_ENERGY)
        }else{
          return creep.travelTo(tgt)
        }
      }
    }
    let tgt = Game.getObjectById(this.mem.tgt) || creep.room.controller.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES)
    this.mem.tgt = tgt && tgt.id || false
    if(!tgt) tgt = creep.room.controller
    if (creep.pos.inRangeTo(tgt, 3)) {
      if (tgt.structureType == STRUCTURE_CONTROLLER) {
        creep.upgradeController(tgt)
      } else {
        creep.build(tgt)
      }
    } else {
      creep.travelTo(tgt)
    }
  }
}
module.exports = Build