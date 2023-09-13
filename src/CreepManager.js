// @ts-ignore
import StackState from './StackState'
import GenState from './GenState'
import { kernel, sleep, restartThread } from './kernel'
import { sayings, psayings } from './sayings'

kernel.createProcess('CreepManager', restartThread, creepManager)

function * creepManager () {
  const maintain = [
    ['memoryCleanup', creepMemoryCleanup],
    ['threadManager', creepThreadManager],
    ['saysThread', creepSaysThread],
    ['idThread', creepIDThread]
  ]
  while (true) {
    for (const [name, fn, ...args] of maintain) {
      if (!this.hasThread(name)) {
        this.createThread(name, fn, ...args)
      }
    }
    yield * sleep(5)
  }
}

function * creepIDThread () {
  const roles = {
    builder: '🔨',
    miningCollector: '🚚',
    miningWorker: '⛏️',
    worker: '👷',
    upgrader: '⬆️',
    upgradeHauler: '🚛',
    hauler: '🚛',
    scout: '👁️',
    scoutVision: '🕵️',
    reserver: '🏴',
    claimer: '🏁',
    cleaningCrew: '🧹',
    feeder: '📦',
    defender: '🛡️'
  }
  while (true) {
    while (Game.cpu.bucket < 5000) yield
    for (const { room, pos: { x, y }, memory: { role, run } } of Object.values(Game.creeps)) {
      const icon = roles[role] || roles[run] || ''
      if (icon) {
        room.visual.text(icon, x, y + 0.1, { font: 0.4 })
      }
      yield true
    }
    yield
  }
}

function * creepMemoryCleanup () {
  while (true) {
    for (const name of Object.keys(Memory.creeps || {})) {
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
      if (!Game.creeps[creep.name]) continue
      if (creep.saying) continue
      if (creep.ticksToLive === 1) {
        creep.say('RIP Me', true)
        yield true
        continue
      }
      if (Game.time === start) {
        this.createThread(`creepSay_${creep.name}`, creepSayWords, creep.name, startPhrase)
        continue
      }
      if (Math.random() < 0.001) {
        const startPhrase = random[Math.floor(Math.random() * random.length)].split('|')
        this.createThread(`creepSay_${creep.name}`, creepSayWords, creep.name, startPhrase)
        continue
      }
      if (creep.memory.role && creep.memory.role.startsWith('scout') && Math.random() > 0.4) {
        let txt = sayings[Math.floor(Math.random() * sayings.length)]
        const { room } = creep
        if (room.controller && room.controller.owner && room.controller.owner.username && !room.controller.my) {
          const user = room.controller.owner.username
          txt = psayings[Math.floor(Math.random() * psayings.length)]
          if (Math.random() > 0.5) {
            const smileys = '😀😁😃😄😆😉😊☺️😛😜😝😈👁️'
            txt = smileys.substr(Math.floor(Math.random() * (smileys.length / 2)) * 2, 2)
          }
          txt = txt.replace(/USER/, user)
        }
        const words = txt.split('|')
        this.createThread(`creepSay_${creep.name}`, creepSayWords, creep.name, words)
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
  const prefix = 'creep:'
  while (true) {
    let created = 0
    let cleanup = 0
    for (const creepName in Game.creeps) {
      if (!Game.creeps[creepName]) continue
      const key = `${prefix}${creepName}`
      if (!this.hasThread(key)) {
        let gen = newStackStateThread
        if (Memory.creeps[creepName].run) {
          gen = GenState.runCreep
        }
        this.createThread(key, gen, creepName)
        created++
      }
      yield true
    }
    for (const key of this.process.threads) {
      if (!key.startsWith(prefix)) continue
      const creepName = key.slice(prefix.length)
      if (!Game.creeps[creepName]) {
        cleanup++
        this.destroyThread(key)
      }
      yield true
    }
    this.log.info(`Created: ${created}, cleaned up: ${cleanup}`)
    yield * sleep(3)
  }
}

/**
 * 
 * @type {GeneratorThreadFn}
 */
function * newStackStateThread (creepName) {
  while (Game.creeps[creepName]) {
    const creep = Game.creeps[creepName]
    const start = Game.cpu.getUsed()
    try {
      // log.info(`[StackState] ${creepName}`)
      StackState.runCreep(creep)
    } catch (err) {
      this.log.error(`Creep ${creep} failed to run ${err.stack}`)
      creep.room.visual.text(err.toString(), creep.pos.x, creep.pos.y, {
        color: '#FF0000'
      })
    }
    const end = Game.cpu.getUsed()
    const dur = end - start
    creep.room.visual.text(dur.toFixed(2), creep.pos.x, creep.pos.y - 0.5, { font: 0.4, opacity: 0.7 })
    yield
  }
  delete Memory.creeps[creepName]
}
