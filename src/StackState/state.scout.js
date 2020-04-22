const log = require('/log')

const size = require('lodash/size')

const C = require('/constants')
const SIGN_MSG = `Territory of ZeSwarm - ${C.USER}`
const SIGN_MY_MSG = `ZeSwarm - https://github.com/ags131/ZeSwarm`
const SIGN_COOLDOWN = 50

module.exports = {
  scoutVision (roomName) {
    if (this.creep.room.name !== roomName) {
      this.push('moveToRoom', roomName)
      return this.runStack()
    }
    const park = (this.creep.room.controller && this.creep.room.controller.pos) || new RoomPosition(25, 25, roomName)
    if (!this.creep.pos.inRangeTo(park, 3)) {
      this.push('moveInRange', park, 3)
      return this.runStack()
    }
    this.creep.say('👁️', true)
  },
  scout (state = false) {
    if (state === false) {
      this.pop()
      this.push('scout', {})
      return this.runStack()
    }
    // const debug = this.creep.name === 'scout_13651666_najb'
    if (!state.z) state.z = this.creep.notifyWhenAttacked(false)
    if (!state.work) {
      state.work = this.creep.getActiveBodyparts(C.WORK)
      state.attack = this.creep.getActiveBodyparts(C.ATTACK)
      state.ranged = this.creep.getActiveBodyparts(C.RANGED_ATTACK)
      state.heal = this.creep.getActiveBodyparts(C.heal)
    }
    // if (Game.cpu.getUsed() >= 90) return
    const { room, pos, room: { controller } } = this.creep
    this.status = pos.toString()

    // const target = intel.outdated && intel.outdated.length && intel.outdated[Math.floor(Math.random() * intel.outdated.length)]
    // if (target && false) {
    //   console.log(target)
    //   this.push('moveToRoom', new RoomPosition(25, 25, target), { preferHighway: true })
    // }

    // const user = controller && ((controller.owner && controller.owner.username) || (controller.reservation && controller.reservation.username))
    const friend = controller && controller.my
    const hostile = !friend && controller && controller.level > 0 && !controller.my

    if (hostile) return log.warn(`${room.name} is hostile!`)

    let lastdir = 0
    if (pos.y === 0) lastdir = C.TOP
    if (pos.y === 49) lastdir = C.BOTTOM
    if (pos.x === 0) lastdir = C.LEFT
    if (pos.x === 49) lastdir = C.RIGHT

    const exits = Game.map.describeExits(room.name)
    let dir = 0
    while (!exits[dir] || (dir === lastdir && size(exits) > 1)) {
      dir = Math.ceil(Math.random() * 8)
    }

    const csites = this.creep.room.find(C.FIND_HOSTILE_CONSTRUCTION_SITES).filter(c => !(c.room.getTerrain().get(c.pos.x, c.pos.y) & 1))
    if (csites.length) {
      const csite = csites[Math.floor(Math.random() * csites.length)]
      this.push('travelTo', csite.pos, { visualizePathStyle: { opacity: 1 }, range: 0 })
      return this.runStack()
    }

    const roomCallback = `r => r === '${room.name}' ? undefined : false`
    const exit = pos.findClosestByRange(dir)
    const msg = (controller && controller.my && SIGN_MY_MSG) || SIGN_MSG
    const { lastSigned = 0 } = state
    if (!hostile && controller && (controller.sign && controller.sign.username !== C.SYSTEM_USERNAME) && (!controller.sign || controller.sign.username !== C.USER || controller.sign.text !== msg) && lastSigned < Game.time - SIGN_COOLDOWN) {
      state.lastSigned = Game.time
      this.creep.say('Signing')
      this.push('signController', controller.id, msg)
      this.push('moveNear', controller.pos, { roomCallback })
      return this.runStack()
    }
    state.lastSigned = 0
    if (exit) {
      const { incomplete } = PathFinder.search(this.creep.pos, exit.pos, {
        range: 0,
        maxRooms: 1,
        roomCallback (roomName) {
          const cm = new PathFinder.CostMatrix()
          const room = Game.rooms[roomName]
          if (!room) return false
          const walls = room.constructedWalls
          const ramparts = room.ramparts
          for (const wall of walls) {
            cm.set(wall.pos.x, wall.pos.y, 0xff)
          }
          for (const rampart of ramparts) {
            cm.set(rampart.pos.x, rampart.pos.y, rampart.my || rampart.public ? 1 : 0xff)
          }
          return cm
        }
      })
      if (incomplete) {
        return this.runStack()
      }
      this.push('moveOntoExit', dir)
      this.push('moveNear', exit, { roomCallback })
      this.runStack()
    }
  }
}
