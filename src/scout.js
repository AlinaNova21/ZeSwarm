const C = require('constants')
const SIGN_MSG = 'Territory of ZeSwarm'
const SIGN_MY_MSG = 'ZeSwarm - https://github.com/ags131/ZeSwarm'

class Scout {
  get mem () {
    return this.creep.memory
  }
  run (creep) {
    this.creep = creep
    let { room } = creep
    let { controller } = room
    let hostile = controller && controller.level > 0 && !controller.my
    if (this.mem.last !== room.name) {
      let lastdir = 0
      if (creep.pos.y === 0) lastdir = C.TOP
      if (creep.pos.y === 49) lastdir = C.BOTTOM
      if (creep.pos.x === 0) lastdir = C.LEFT
      if (creep.pos.x === 49) lastdir = C.RIGHT
      let exits = Game.map.describeExits(room.name)
      let dir = 0
      while (!exits[dir] || (dir === lastdir && _.size(exits) > 1)) {
        dir = Math.ceil(Math.random() * 8)
      }
      if (hostile) {
        dir = lastdir
      }
      this.mem.last = creep.room.name
      this.mem.tgt = dir
    }
    let roomCallback = r => r == room.name ? undefined : false
    let exit = creep.pos.findClosestByRange(this.mem.tgt)
    let msg = controller && controller.my && SIGN_MY_MSG || SIGN_MSG
    if (!hostile && controller && (!controller.sign || controller.sign.username !== C.USER || controller.sign.text !== msg)) {
      if (creep.pos.isNearTo(controller)) {
        creep.signController(controller, msg)
      } else {
        return creep.travelTo(controller, { roomCallback })
      }
    }
    this.creep.travelTo(exit, { roomCallback })
    creep.say(this.mem.tgt)
    // console.log(creep,`${this.mem.tgt} ${this.mem.last}`)
  }
}
module.exports = Scout
