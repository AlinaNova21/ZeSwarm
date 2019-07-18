const log = require('/log')
const intel = require('/Intel')
const { sayings, psayings, shooting } = require('/sayings')

const C = require('/constants')
const SIGN_MSG = `Territory of ${C.USER}`
const SIGN_MY_MSG = `${C.USER} - https://github.com/ags131/ZeSwarm`

module.exports = {
  scout (state = {}) {
    if (!state.z) state.z = this.creep.notifyWhenAttacked(false)
    if (!state.work) {
      state.work = this.creep.getActiveBodyparts(C.WORK)
      state.attack = this.creep.getActiveBodyparts(C.ATTACK)
      state.ranged = this.creep.getActiveBodyparts(C.RANGED_ATTACK)
      state.heal = this.creep.getActiveBodyparts(C.heal)
    }
    if (Game.cpu.getUsed() >= 90) return
    this.origScout(this.creep)
    const { room, pos, room: { controller } } = this.creep
    this.status = pos.toString()

    const target = intel.outdated && intel.outdated.length && intel.outdated[Math.floor(Math.random() * intel.outdated.length)]
    if (target) {
      this.push('moveToRoom', new RoomPosition(25, 25, target), { preferHighway: true })
    }

    const user = controller && ((controller.owner && controller.owner.username) || (controller.reservation && controller.reservation.username))
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
    while (!exits[dir] || (dir === lastdir && _.size(exits) > 1)) {
      dir = Math.ceil(Math.random() * 8)
    }

    const csites = this.creep.room.find(FIND_HOSTILE_CONSTRUCTION_SITES)
    if (csites.length) {
      this.push('travelTo', csites[0].pos, { visualizePathStyle: { opacity: 1 } })
      return this.runStack()
    }

    const exit = pos.findClosestByRange(dir)
    const msg = controller && controller.my && SIGN_MY_MSG || SIGN_MSG
    if (!hostile && !friend && controller && (!controller.sign || controller.sign.username !== C.USER || controller.sign.text !== msg)) {
      this.creep.say('Signing')
      this.push('signController', controller.id, msg)
      this.push('moveNear', controller.pos)
      return this.runStack()
    }
    const roomCallback = `r => r === '${room.name}' ? undefined : false`
    this.push('move', dir)
    this.push('moveNear', exit, { roomCallback })
    this.runStack()
  },
  origScout () {
    const c = this.creep
    {
      const target = c.pos.findClosestByRange(FIND_HOSTILE_CREEPS, { filter: c => c.owner.username != 'Source Keeper' })
      if (target && (!c.room.controller || (c.room.controller && (!c.room.controller.safeMode || c.room.controller.my))) && !c.getActiveBodyparts(WORK)) {
        if (target.pos.getRangeTo(c) <= 3) {
          const txt = shooting[Math.floor(Math.random() * shooting.length)]
          if (target.pos.isNearTo(c)) {
            if (c.getActiveBodyparts(ATTACK)) {
              c.attack(target)
            }
            if (c.getActiveBodyparts(RANGED_ATTACK)) {
              c.rangedAttack(target)
            }
            c.move(c.pos.getDirectionTo(target.pos))
          } else {
            c.rangedAttack(target)
            c.travelTo(target)
          }
          c.say(txt, true)
        } else {
          c.travelTo(target)
        }
        return
      }
      if (target && target.pos.getRangeTo(c) < 8) {
        const hostiles = c.room.find(FIND_HOSTILE_CREEPS).filter(c => c.getActiveBodyparts(ATTACK) + c.getActiveBodyparts(RANGED_ATTACK) > 2)
        const result = PathFinder.search(c.pos, hostiles.map(c => ({ pos: c.pos, range: c.getActiveBodyparts(RANGED_ATTACK) ? 15 : 3 })), { flee: true })
        if (result && result.path.length) {
          c.say('Fleeing')
          return c.moveByPath(result.path)
        }
      }
    }
    {
      if (Game.flags.target) {
        Game.flags.target.remove()
      }
      const target = c.pos.findClosestByRange(FIND_STRUCTURES, { filter (s) { return !s.my && s.structureType != 'controller' && s.structureType != 'wall' && s.structureType != 'constructedWall' && s.structureType != 'rampart' } })
      if (target && target.pos.getRangeTo(c) <= 30 && c.room.controller && !c.room.controller.safeMode) {
        const towers = c.room.find(FIND_STRUCTURES, { filter (s) { return s.structureType == 'tower' } }) || []
        if (!towers.length) {
          // c.room.createFlag(c.pos, 'target',COLOR_RED,COLOR_YELLOW)
          // Memory.flags = Memory.flags || {}
          // Memory.flags.target = {
          //   ts: Game.time
          // }
        }
        let txt = shooting[Math.floor(Math.random() * shooting.length)]
        if (c.getActiveBodyparts(WORK)) {
          c.dismantle(target)
          c.travelTo(target, { offroad: true })
          txt = 'DESTROY'
        }
        if (c.getActiveBodyparts(ATTACK)) {
          c.attack(target)
          c.travelTo(target, { offroad: true })
        }
        if (c.getActiveBodyparts(RANGED_ATTACK)) {
          c.rangedAttack(target)
        }
        c.say(txt, true)
        return
      }
      if (Game.flags.target && Game.flags.target.memory.ts < Game.time - 1000) {
        Game.flags.target.remove()
      }
      if (!target && c.room.controller && Game.flags.target && Game.flags.target.pos.roomName == c.room.name) {
        Game.flags.target.remove()
      }
    }
    if (c.memory.phrase && c.memory.phrase.length) {
      const txt = c.memory.phrase.shift()
      c.say(txt, true)
    }
    if (Math.random() > 0.9) {
      let txt = sayings[Math.floor(Math.random() * sayings.length)]
      if (c.room.controller && c.room.controller.owner && c.room.controller.owner.username && c.room.controller.owner.username != C.USER) {
        const user = c.room.controller.owner.username
        txt = psayings[Math.floor(Math.random() * psayings.length)]
        if (Math.random() > 0.7) {
          const smileys = '😀😁😃😄😆😉😊☺️😛😜😝😈'
          txt = smileys.substr(Math.floor(Math.random() * (smileys.length / 2)) * 2, 2)
        }
        txt = txt.replace(/USER/, user)
      }
      if (~txt.indexOf('|')) {
        ;[txt, ...phrase] = txt.split('|')
        c.memory.phrase = phrase
      }
      c.say(txt, true)
    }
  }
}
