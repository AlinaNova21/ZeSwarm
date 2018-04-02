import each from 'lodash-es/each'
import C from '/include/constants'
import BaseProcess from './BaseProcess'

export default class TowerDefense extends BaseProcess {
  constructor (context) {
    super(context)
    this.context = context
  }

  get room () {
    return Game.rooms[this.memory.room]
  }

  expand (body) {
    let cnt = 1
    let ret = []
    for (let i in body) {
      let t = body[i]
      if (typeof t === 'number') {
        cnt = t
      } else {
        for (let ii = 0; ii < cnt; ii++) {
          ret.push(t)
        }
      }
    }
    return ret
  }

  run () {
    const room = this.room
    if (!room) {
      this.log.warn(`No vision in ${this.memory.room}`)
      return
    }
    const vis = room.visual
    const hostiles = room.find(FIND_HOSTILE_CREEPS).filter(({ pos: { x, y } }) => x && x !== 49 && y && y !== 49)
    if (hostiles.length) {
      console.log('Hostiles!',hostiles.map(h=>`${h} ${h.owner.username}`))
      room.towers.forEach(tower => {
        const tgt = tower.pos.findClosestByRange(hostiles)
        tower.attack(tgt)
        vis.line(tower.pos, tgt.pos, {
          width: 0.2,
          color: '#FF0000'
        })
        vis.line(tgt.pos.x - 0.4, tgt.pos.y, tgt.pos.x + 0.4, tgt.pos.y, {
          width: 0.2,
          color: '#FF0000',
        })
        vis.line(tgt.pos.x, tgt.pos.y - 0.4, tgt.pos.x, tgt.pos.y + 0.4, {
          width: 0.2,
          color: '#FF0000',
        })
        vis.circle(tgt.pos, {
          radius: 0.4,
          fill: '#dc0000',
          stroke: '#ff0000',
          opacity: 0.3
        })
      })
    }    
  }
  toString () {
    return this.memory.room
  }
}
