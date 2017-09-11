class Up {
  get mem() {
    return this.creep.memory
  }
  run(creep){
    this.creep = creep
    if (creep.carry.energy == 0) {
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
    let controller = creep.room.controller
    if (creep.pos.inRangeTo(controller, 3)) {
      creep.upgradeController(controller)
    }else{
      creep.travelTo(controller)
    }
  }
}
module.exports = Up