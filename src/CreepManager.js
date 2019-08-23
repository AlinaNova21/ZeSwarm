import StackState from './StackState'
import { kernel, sleep, restartThread } from './kernel'
import log from '/log'
import { sayings, psayings } from '/sayings'

kernel.createThread('creepMemoryCleanup', restartThread(creepMemoryCleanup))
kernel.createThread('creepThreadManager', restartThread(creepThreadManager))
kernel.createThread('creepSaysThread', restartThread(creepSaysThread))
kernel.createThread('creepIDThread', restartThread(creepIDThread))

function * creepIDThread () {
  const roles = {
    miningCollector: '🚚',
    miningWorker: '⛏️',
    worker: '👷',
    scout: '👁️',
    reserver: '🏴',
    claimer: '🏁',
    cleaningCrew: '🧹'
  }
  while (true) {
    while (Game.cpu.bucket < 5000) yield
    for (const { room, pos: { x, y }, memory: { role } } of Object.values(Game.creeps)) {
      const icon = roles[role] || ''
      if (icon) {
        room.visual.text(icon, x, y + 0.1, { size: 0.4 })
      }
      yield true
    }
    yield
  }
}

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
  const start = Game.time
  const random = [
    'For the|swarm!',
    'No bugs!',
    'Kill bugs',
    'Grow even|stronger!',
    'Upgrade|applied!'
  ]
  const startPhrase = random[Math.floor(Math.random() * random.length)].split('|')
  while (true) {
    for (const creep of Object.values(Game.creeps)) {
      if (creep.saying) continue
      if (creep.ticksToLive === 1) {
        creep.say('RIP Me', true)
        yield true
        continue
      }
      if (Game.time === start) {
        kernel.createThread(`creepSay_${creep.name}`, creepSayWords(creep.name, startPhrase))
        continue
      }
      if (Math.random() < 0.001) {
        const startPhrase = random[Math.floor(Math.random() * random.length)].split('|')
        kernel.createThread(`creepSay_${creep.name}`, creepSayWords(creep.name, startPhrase))
        continue
      }
      if (creep.memory.role === 'scout' && Math.random() > 0.6) {
        let txt = sayings[Math.floor(Math.random() * sayings.length)]
        const { room } = creep
        if (room.controller && room.controller.owner && room.controller.owner.username && !room.controller.my) {
          const user = room.controller.owner.username
          txt = psayings[Math.floor(Math.random() * psayings.length)]
          if (Math.random() > 0.7) {
            const smileys = '😀😁😃😄😆😉😊☺️😛😜😝😈👁️'
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

function * creepThreadManager () {
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
    creep.room.visual.text(dur.toFixed(2), creep.pos.x, creep.pos.y - 0.5, { size: 0.4, opacity: 0.7 })
    yield
  }
  delete Memory.creeps[creepName]
}
