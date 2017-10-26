class Stomper {
  get mem() {
    return this.creep.memory
  }
  run(creep){
    this.creep = creep
    let { room } = creep
    let hostileConSites = room.find(FIND_HOSTILE_CONSTRUCTION_SITES)
    let [tgt] = hostileConSites
    if(tgt){
      creep.travelTo(tgt)
    } else {
      this.mem.role = 'scout'
    }
  }
}
module.exports = Stomper