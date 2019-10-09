import { Logger, LogLevel } from './log'
import shuffle from 'lodash/shuffle'
import stats from './stats'

const log = new Logger('[Kernel]')

export class Kernel {
  constructor () {
    this.threads = new Map()
    log.info(`Kernel Created`)
    this.pidGen = calcCPUPID()
  }

  tick () {
    if (Game.cpu.bucket < 1000) return
    if (!this.threads.has('kBase')) {
      log.info('Starting kBase')
      this.threads.set('kBase', kernelBase(this))
    }
    log.info(`threads: ${[...this.threads.keys()]}`)
    let cnt = 0
    const { value: limit } = this.pidGen.next()
    this.scheduler = {}
    const scheduler = loopScheduler(this.threads, limit, this.scheduler)
    for (const val of scheduler) { // eslint-disable-line no-unused-vars
      if (typeof val === 'string') {
        this.threads.delete(val)
      }
      // log.info(`tick ${val}`)
      cnt++
    }
    stats.addStat('kernel', {}, {
      cpuLimit: limit,
      threads: this.threads.size,
      iterations: cnt
    })
    log.info(`CPU Limit for tick: ${limit.toFixed(2)}/${Game.cpu.limit} Bucket: ${Game.cpu.bucket}`)
    log.log(cnt < this.threads.size ? LogLevel.WARN : LogLevel.INFO, `Ran ${this.threads.size} threads with a total of ${cnt} iterations`)
  }

  next (val) {
    if (val === true) {
      const { value } = this.pidGen.next()
      this.scheduler = loopScheduler(this.threads, value)
      return { done: false, value: false }
    }
    const { done } = this.scheduler.next()
    return { done: false, value: !done }
  }

  [Symbol.iterator] () { return this }

  hasThread (name) {
    return this.threads.has(name)
  }

  createThread (name, gen) {
    this.threads.set(name, new Thread(name, gen))
  }

  destroyThread (name) {
    return this.threads.delete(name)
  }
}

export const kernel = new Kernel()

function * kernelBase (kernel) {
  const ctx = { kernel }
  const baseThreads = [
    // ['kTest', kTest]
  ]
  while (true) {
    for (const [name, fn, ...args] of baseThreads) {
      if (!kernel.threads.has(name)) {
        kernel.threads.set(name, fn(ctx, ...args))
      }
      yield true
    }
    yield
  }
}

class Thread {
  constructor (name, gen) {
    this.name = name
    this.__gen = gen
    this.done = false
    this.value = undefined
  }

  next (val) {
    const { done, value } = this.__gen.next(val)
    this.done = done
    this.value = value
    return { done, value }
  }

  [Symbol.iterator] () { return this }
}

function * PID (Kp, Ki, Kd, Mi, statName) {
  let e = 0
  let i = 0
  let v = 0
  while (true) {
    const le = e
    e = yield v
    i = i + e
    i = Math.min(Math.max(i, -Mi), Mi)
    const Up = (Kp * e)
    const Ui = (Ki * i)
    const Ud = Kd * (e / le) * e
    v = Up + Ui + Ud
    if (statName) {
      stats.addStat(statName, {}, {
        Kp, Ki, Kd, Mi, e, i, v, Up, Ui, Ud
      })
    }
  }
}

function * calcCPUPID () {
  const Kp = 0.020
  const Ki = 0.01
  const Kd = 0
  const Mi = 1000
  const Se = 0.5
  const pid = PID(Kp, Ki, Kd, Mi, 'pidb')
  while (true) {
    const { value: output } = pid.next(Se * (Game.cpu.bucket - 9500))

    const minLimit = Math.max(15, Game.cpu.limit * 0.2)
    const limit = Math.max(Game.cpu.limit + output - Game.cpu.getUsed(), minLimit)
    log.info(`[PID] limit: ${limit} out: ${output} min: ${minLimit}`)
    // console.table({e, i, Up, Ui, output, bucket: Game.cpu.bucket, limit})
    yield limit || minLimit
  }
}

function * loopScheduler (threads, limit, state = {}) {
  const queue = shuffle(Array.from(threads.entries()))
  const counts = {}
  const cpu = {}
  const logger = log.withPrefix(log.prefix + '[LoopScheduler]')
  logger.info(`Current CPU: ${Game.cpu.getUsed()}/${Game.cpu.limit}`)
  for (const item of queue) {
    // logger.info(`[loopScheduler] Running ${item[0]}`)
    state.current = item[0]
    try {
      const start = Game.cpu.getUsed()
      const { done, value } = item[1].next()
      const end = Game.cpu.getUsed()
      const dur = end - start
      counts[item[0]] = counts[item[0]] || 0
      counts[item[0]]++
      cpu[item[0]] = cpu[item[0]] || 0
      cpu[item[0]] += dur
      if (!done && value === true) {
        queue.push(item)
      }
      if (done) {
        threads.delete(item[0])
      }
    } catch (err) {
      threads.delete(item[0])
      log.error(`Error running thread: ${item[0]} ${err.stack || err.message || err}`)
      yield item[0]
    }
    state.current = null

    if (Game.cpu.getUsed() > limit) {
      logger.info(`CPU Limit reached`)
      const report = queue.slice(queue.indexOf(item))
        .map(i => [i[0], cpu[i[0]]])
        .filter(i => i[1] > 2)
        .map(([a, b]) => `${a}: ${b.toFixed(3)}`)
      logger.info(`Threads remaining: ${report}`)
      return
    }
    yield
  }
}

export function * sleep (ticks) {
  const end = Game.time + ticks
  while (Game.time < end) yield
}

export function * restartThread (fn) {
  const name = kernel.scheduler.current
  while (true) {
    try {
      yield * fn()
    } catch (err) {
      log.error(`Thread '${name}' exited with error: ${err.stack || err.message || err}`)
    }
    yield
  }
}
