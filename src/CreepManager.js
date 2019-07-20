import StackState from './StackState'
import { kernel, sleep } from '/kernel'
import log from '/log'
import { sayings, psayings } from '/sayings'

kernel.createThread('creepMemoryCleanup', creepMemoryCleanup())
kernel.createThread('creepThreadManager', creepThreadManager({ kernel }))
kernel.createThread('creepSaysThread', creepSaysThread())

function * creepMemoryCleanup () {
  while (true) {
    for (const name of Object.keys(Memory.creeps)) {
      if (!Game.creeps[name]) {
        delete Memory.creeps[name]
      }
      yield true
    }
    yield * sleep(10)
  }
}

function * creepSaysThread () {
  while (true) {
    for (const creep of Object.values(Game.creeps)) {
      if (creep.saying) continue
      if (creep.ticksToLive === 1) {
        creep.say('RIP Me', true)
        yield true
        continue
      }
      if (creep.memory.role === 'scout' && Math.random() > 0.8) {
        let txt = sayings[Math.floor(Math.random() * sayings.length)]
        const { room } = creep
        if (room.controller && room.controller.owner && room.controller.owner.username && !room.controller.my) {
          const user = room.controller.owner.username
          txt = psayings[Math.floor(Math.random() * psayings.length)]
          if (Math.random() > 0.7) {
            const smileys = '😀😁😃😄😆😉😊☺️😛😜😝😈'
            txt = smileys.substr(Math.floor(Math.random() * (smileys.length / 2)) * 2, 2)
          }
          txt = txt.replace(/USER/, user)
        }
        const words = txt.split('|')
        kernel.createThread(`creepSay_${creep.name}`, creepSayWords(creep.name, words))
      }
    }
    yield
  }
}

function * creepSayWords (creepName, parts, pub = true) {
  for (const part of parts) {
    if (!Game.creeps[creepName]) return
    Game.creeps[creepName].say(part, pub)
    yield
  }
}

function * creepThreadManager ({ kernel }) {
  const threads = kernel.threads
  const prefix = 'stackState_'
  while (true) {
    let created = 0
    let cleanup = 0
    for (const creepName in Game.creeps) {
      const key = `${prefix}${creepName}`
      if (!threads.has(key)) {
        const thread = newStackStateThread(creepName)
        thread.creepName = creepName
        created++
        threads.set(key, thread)
      }
      yield true
    }
    for (const [key, thread] of threads.entries()) {
      if (!key.startsWith(prefix)) continue
      if (!Game.creeps[thread.creepName]) {
        cleanup++
        threads.delete(key)
      }
      yield true
    }
    log.info(`[creepThreadManager] Created: ${created}, cleaned up: ${cleanup}`)
    yield
  }
}

function * newStackStateThread (creepName) {
  while (Game.creeps[creepName]) {
    const creep = Game.creeps[creepName]
    const start = Game.cpu.getUsed()
    try {
      // log.info(`[StackState] ${creepName}`)
      StackState.runCreep(creep)
    } catch (err) {
      log.error(`Creep ${creep} failed to run ${err.stack}`)
    }
    const end = Game.cpu.getUsed()
    const dur = end - start
    creep.room.visual.text(dur.toFixed(2), creep.pos.x, creep.pos.y - 0.5)
    yield
  }
  delete Memory.creeps[creepName]
}
