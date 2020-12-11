import * as genStates from './states'
import { log } from './common'

export function * runCreep (creepName) {
  let gen = null
  while (Game.creeps[creepName]) {
    const creep = Game.creeps[creepName]
    if (!gen) {
      gen = genStates[creep.memory.run](creep.safe())
    }
    const start = Game.cpu.getUsed()
    try {
      log.prefix = this.log.prefix
      const { done } = gen.next()
      if (done) gen = null
    } catch (err) {
      this.log.error(`Creep ${creep} failed to run ${err.stack}`)
    }
    const end = Game.cpu.getUsed()
    const dur = end - start
    creep.room.visual.text(dur.toFixed(2), creep.pos.x, creep.pos.y - 0.5, { size: 0.4, opacity: 0.7 })
    yield
  }
  delete Memory.creeps[creepName]
}

export default {
  runCreep
}