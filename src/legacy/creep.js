import scout from './scout'
import atk from './atk'
import build from './build'
import drainer from './drainer'
import harv from './harv'
import stomper from './stomper'
import up from './up'
import cart from './cart'

const roles = {
  scout: new scout(),
  atk: new atk(),
  build: new build(),
  drainer: new drainer(),
  harv: new harv(),
  stomper: new stomper(),
  up: new up(),
  cart: new cart()
}
export default class Creep {
  run (creep) {
    if (creep.name[0] == 'C') return
    let role = creep.memory.role ||
     (function () {
       let r = 'scout'
       let parts = _.groupBy(creep.body, 'type')
       if (parts[WORK]) {
         r = 'build'
       }
       return r
     })()
    let rolec = this.tryLoadRole(role)
    if (rolec) {
      let start = Game.cpu.getUsed()
      try {
        rolec.run(creep)
      } catch (e) {
        console.log(`Creep ${creep.name} Error: ${e.stack}`)
      }
      let end = Game.cpu.getUsed()
      creep.room.visual.text(Math.round((end - start) * 100) / 100, creep.pos.x + 1, creep.pos.y, { size: 0.6 })
    } else {
      console.log(`Missing role: ${role}`)
    }
  }
  tryLoadRole (role) {
    if (roles[role]) return roles[role]
    try {
      let Cl = require(role)
      roles[role] = new Cl()
      return roles[role]
    } catch (e) {
      console.log(`Could not load role ${role}`)
    }
  }
}
