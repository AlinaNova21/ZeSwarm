import SafeObject from 'lib/SafeObject'
import { log } from './common'
import * as genStates from './states'

/**
 * @param {string} creepName
 * @returns {Generator<void, void | boolean, void>}
 */
export function* runCreep(creepName) {
  let gen = null
  while (Game.creeps[creepName]) {
    const creep = Game.creeps[creepName]
    if (creep.spawning) {
      yield
      continue
    }
    if (!gen) {
      gen = genStates[creep.memory.run](new SafeObject(creep.id))
    }
    const start = Game.cpu.getUsed()
    try {
      log.prefix = this.log.prefix
      const { done } = gen.next()
      if (done) gen = null
    } catch (err) {
      this.log.error(`Creep ${creep} failed to run ${err.stack}`)
      creep.room.visual.text(err.toString(), creep.pos.x, creep.pos.y, {
        color: '#FF0000'
      })
      gen = null
      // return
    }
    const end = Game.cpu.getUsed()
    const dur = end - start
    creep.room.visual.text(dur.toFixed(2), creep.pos.x, creep.pos.y - 0.5, { font: 0.4, opacity: 0.7 })
    yield
  }
  delete Memory.creeps[creepName]
}

export default {
  runCreep
}