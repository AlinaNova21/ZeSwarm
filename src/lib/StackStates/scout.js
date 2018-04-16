import sum from 'lodash-es/sum'
import values from 'lodash-es/values'

import { SIGN_MSG, SIGN_MY_MSG } from '/etc/scout'

export default {
  scout (state = {}) {
    let { room, pos } = this.creep
    let { controller } = room
    this.status = pos.toString()
    let hostile = controller && controller.level > 0 && !controller.my
    if (hostile) return this.log.warn(`${room.name} is hostile!`)

    let lastdir = 0
    if (pos.y === 0) lastdir = C.TOP
    if (pos.y === 49) lastdir = C.BOTTOM
    if (pos.x === 0) lastdir = C.LEFT
    if (pos.x === 49) lastdir = C.RIGHT

    let exits = Game.map.describeExits(room.name)
    let dir = 0
    while (!exits[dir] || (dir === lastdir && _.size(exits) > 1)) {
      dir = Math.ceil(Math.random() * 8)
    }

    let exit = pos.findClosestByRange(dir)
    let msg = controller && controller.my && SIGN_MY_MSG || SIGN_MSG
    if (!hostile && controller && (!controller.sign || controller.sign.username !== C.USER || controller.sign.text !== msg)) {
      this.creep.say('Signing')
      this.push('signController', controller.id, msg)
      this.push('moveNear', controller.pos)
      return this.runStack()
    }
    let roomCallback = `r => r === '${room.name}' ? undefined : false`
    this.push('move', dir)
    this.push('moveNear', exit, { roomCallback })
    this.runStack()
  }
}
