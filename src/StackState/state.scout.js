const log = require('@/log')
const intel = require('@/Intel')
const size = require('lodash/size')

const C = require('@/constants')
const config = require('@/config')
const SIGN_MSG = `Territory of ZeSwarm - ${C.USER}`
const SIGN_MY_MSG = `ZeSwarm - https://github.com/ags131/ZeSwarm`
const SIGN_COOLDOWN = 50

module.exports = {
  scoutVision (roomName) {
    if (this.creep.room.name !== roomName) {
      // this.push('moveToRoom', roomName)
      // return this.runStack()
    }
    const park = (this.creep.room.name === roomName && this.creep.room.controller && this.creep.room.controller.pos) || new RoomPosition(25, 25, roomName)
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
    //   this.push('moveToRoom', target, { preferHighway: true })
    // }

    const user = controller && ((controller.owner && controller.owner.username) || (controller.reservation && controller.reservation.username))
    const mine = controller && controller.my
    const friend = !mine && user && (config.noSign.includes(user) || config.allies.includes(user))
    const hostile = !mine && !friend && controller && controller.level > 0 && !controller.my

    if (hostile) return this.log.warn(`${room.name} is hostile!`)

    let lastdir = 0
    if (pos.y === 0) lastdir = C.TOP
    if (pos.y === 49) lastdir = C.BOTTOM
    if (pos.x === 0) lastdir = C.LEFT
    if (pos.x === 49) lastdir = C.RIGHT

    const exits = Game.map.describeExits(room.name)
    const portals = room.find(FIND_STRUCTURES, { filter: { structureType: C.STRUCTURE_PORTAL } }).filter(p => !p.destination.shard || p.destination.shard === Game.shard.name)
    const choices = [C.TOP,C.BOTTOM,C.LEFT,C.RIGHT].filter(d => d !== lastdir && exits[d] && d !== state.incomplete)
    const rooms = new Set()
    portals.forEach(p => rooms.add(p.destination.room))
    let ri = 100
    for(const room of rooms) {
      const i = ri++
      exits[i] = room
      choices.push(i)
    }
    if (choices.length === 0) {
      choices.push(lastdir)
    }
    if (state.incomplete) {
      const ind = choices.indexOf(state.incomplete)
      choices.splice(ind, 1)
      delete state.incomplete
    }
    intel.rooms = intel.rooms || {}
    const oldest = choices.reduce((l,dir) => {
      const int = intel.rooms[exits[dir]]
      const age = int ? Game.time - int.ts : 1e10
      return age > l.age ? { age, dir } : l
    }, { age: 0, dir: 0 })
    
    const scouts = room.find(FIND_MY_CREEPS).filter(c => c.memory.role === 'scout')
    let dir = scouts.length > 1 ? 0 : oldest.dir
    while (!exits[dir] || (dir === lastdir && size(exits) > 1)) {
      dir = Math.ceil(Math.random() * 8)
    }

    const csites = this.creep.room.find(C.FIND_HOSTILE_CONSTRUCTION_SITES).filter(c => !(c.room.getTerrain().get(c.pos.x, c.pos.y) & 1))
    if (!friend && csites.length) {
      const csite = csites[Math.floor(Math.random() * csites.length)]
      this.push('travelTo', csite.pos, { visualizePathStyle: { opacity: 1 }, range: 0 })
      return this.runStack()
    }

    const roomCallback = `r => r === '${room.name}' ? undefined : false`
    const exit = pos.findClosestByRange(dir >= 100 ? portals.filter(p => p.destination.room === exits[dir]) : dir)
    const msg = (controller && controller.my && SIGN_MY_MSG) || SIGN_MSG
    const { lastSigned = 0 } = state
    //  && (lastSigned < (Game.time - SIGN_COOLDOWN))
    if (!hostile && !friend && controller && (controller.sign && controller.sign.username !== C.SYSTEM_USERNAME) && (!controller.sign || controller.sign.username !== C.USER || controller.sign.text !== msg)) {
      // state.lastSigned = Game.time
      this.creep.say('Signing')
      this.push('signController', controller.id, msg)
      this.push('moveNear', controller.pos, { roomCallback })
      return this.runStack()
    }
    state.lastSigned = 0
    if (exit) {
      const { incomplete, path } = PathFinder.search(this.creep.pos, exit, {
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
        state.incomplete = dir
        this.creep.say(`Inc ${dir}`)
        // return this.runStack()
        this.push('noop')
        return
      }
      Game.map.visual.poly(path, { opacity: 1, strokeWidth: 1 })
      if (exit.structureType === C.STRUCTURE_PORTAL) {
        this.push('travelTo', exit, { roomCallback, range: 0 })
      } else {
        this.push('moveOntoExit', dir)
        // this.push('moveNear', exit, { roomCallback, maxRooms: 1 })
        this.push('travelTo', exit, { roomCallback, range: 1, maxRooms: 1 })
      }
      this.runStack()
    }
  }
}
