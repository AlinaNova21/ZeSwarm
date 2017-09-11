let census = {
  getCreeps(){
    if(this.lastRan == Game.time) return;
    this.lastRan = Game.time
    this.all = []
    this.rooms = {}
    this.roles = {}
    this.groups = {}
    _.forEach(Game.creeps,creep=>{
      let mem = creep.memory
      // let [homeRoom,role] = creep.name.match()
      let room = this.rooms[mem.homeRoom] = this.rooms[mem.homeRoom] || {
        all: [],
        roles: {},
        groups: {},
      }

      this.all.push(creep)
      room.all.push(creep)

      this.roles[mem.role] = this.roles[mem.role] || []
      this.roles[mem.role].push(creep)
      room.roles[mem.role] = room.roles[mem.role] || []
      room.roles[mem.role].push(creep)
            
      this.groups[mem.g] = this.groups[mem.g] || []
      this.groups[mem.g].push(creep)
      room.groups[mem.g] = room.groups[mem.g] || []
      room.groups[mem.g].push(creep)
    })
  }
}

module.exports = new Proxy(census,{
  get: (target,name)=>{
    target.getCreeps()
    return target[name]
  }
})