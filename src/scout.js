class Scout {
  get mem() {
    return this.creep.memory
  }
  run(creep){
    this.creep = creep
    let { room } = creep
    let { controller } = room
    if (this.mem.last !== room.name) {
      let lastdir = 0;
      if(creep.pos.y == 0) lastdir = TOP
      if(creep.pos.y == 49) lastdir = BOTTOM
      if(creep.pos.x == 0) lastdir = LEFT
      if(creep.pos.x == 49) lastdir = RIGHT
      let exits = Game.map.describeExits(room.name)
      let dir = 0
      let hostile = controller && controller.level > 0 && !controller.my
      while(!exits[dir] || (dir === lastdir && _.size(exits) > 1)) {
        dir = Math.ceil(Math.random() * 8)
      }
      if(hostile){ 
        dir = lastdir 
      }
      this.mem.last = creep.room.name
      this.mem.tgt = dir
    }
    let exit = creep.pos.findClosestByRange(this.mem.tgt)
    this.creep.travelTo(exit)
    creep.say(this.mem.tgt)
    // console.log(creep,`${this.mem.tgt} ${this.mem.last}`)
  }
}
module.exports = Scout