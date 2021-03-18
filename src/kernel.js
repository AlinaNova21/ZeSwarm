import { Logger, LogLevel } from './log'
import shuffle from 'lodash/shuffle'
import stats from './stats'

export class Thread {
  constructor(process, name, fn, args = []) {
    this.process = process
    this.processName = process.processName
    this.fullName = `${process.processName}:${name}`
    this.name = name
    this.gen = fn.apply(this, args)
    Object.freeze(this)
  }

  get log () {
    return this.process.log
  }

  get memory () {
    return this.process.memory
  }

  next () {
    return this.gen.next()
  }

  [Symbol.iterator]() { return this }

  createThread (name, fn, ...args) {
    return this.process.createThread(name, fn, ...args)
  }

  destroyThread(name) {
    return this.process.destroyThread(name)
  }

  hasThread(name) {
    return this.process.hasThread(name)
  }

  kill() {
    return this.process.kill()
  }
}
export class Process {
  constructor (kernel, processName) {
    this.kernel = kernel
    this.processName = processName
    this.memory = {}
    this.threads = new Set()
    this.log = new Logger(`[${processName}]`)
    Object.freeze(this)
  }

  createThread (name, fn, ...args) {
    this.threads.add(name)
    return this.kernel.createThread(this.processName, name, fn, ...args)
  }

  destroyThread (name) {
    this.threads.delete(name)
    return this.kernel.destroyThread(`${this.processName}:${name}`)
  }

  hasThread (name) {
    return this.kernel.hasThread(`${this.processName}:${name}`)
  }

  kill () {
    for (const name of this.threads) {
      this.destroyThread(name)
    }
  }
}

export class Kernel {
  constructor () {
    this.threads = new Map()
    this.processes = new Map()
    this.pidGen = calcCPUPID()
    this.startTick = Game.time
    this.log = new Logger('[Kernel]')
    this.log.info(`Kernel Created`)
  }

  tick () {
    if (Game.cpu.bucket < 1000) return
    const uptime = Game.time - this.startTick
    let cnt = 0
    const { value: limit = 0 } = this.pidGen.next()
    this.scheduler = {}
    const scheduler = loopScheduler(this.threads, limit, this.scheduler)
    for (const val of scheduler) { // eslint-disable-line no-unused-vars
      if (typeof val === 'string') {
        this.threads.delete(val)
      }
      cnt++
    }
    stats.addStat('kernel', {}, {
      cpuLimit: limit,
      threads: this.threads.size,
      iterations: cnt,
      uptime
    })
    this.log.info(`CPU Limit for tick: ${limit.toFixed(2)}/${Game.cpu.limit}  Bucket: ${Game.cpu.bucket}`)
    this.log.log(cnt < this.threads.size ? LogLevel.WARN : LogLevel.INFO, `Uptime: ${uptime}  Threads: ${this.threads.size}  Iterations: ${cnt}`)
    // log.log(cnt < this.threads.size ? LogLevel.WARN : LogLevel.INFO, `Ran ${this.threads. size} threads with a total of ${cnt} iterations`)
  }

  * [Symbol.iterator] () {
    while (true) {
      this.tick()
      yield
    }
  }

  hasThread (name) {
    return this.threads.has(name)
  }

  createThread (processName, name, fn, ...args) {
    const process = this.processes.get(processName)
    if (!process) throw new Error(`Tried creating thread '${name}' for missing process '${processName}'`)
    const thread = new Thread(process, name, fn, args)
    this.threads.set(thread.fullName, thread)
    if (this.scheduler && this.scheduler.queue) {
      this.scheduler.queue.push([thread.fullName, thread])
    }
  }

  destroyThread (name) {
    const thread = this.threads.get(name)
    return this.threads.delete(name)
  }

  hasProcess (name) {
    return this.processes.has(name)
  }

  addProcess (name, process) {
    this.processes.set(name, process)
  }
  
  createProcess (name, fn, ...args) {
    const process = new Process(this, name, fn, args)
    this.addProcess(name, process)
    process.createThread('main', fn, ...args)
  }

  destroyProcess (name) {
    const proc = this.processes.get(name)
    proc.kill()
    return this.processes.delete(name)
  }
}

export const kernel = new Kernel()

export function * PID (Kp, Ki, Kd, Mi, statName) {
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
  const Se = 0.01
  const pid = PID(Kp, Ki, Kd, Mi, 'pidb')
  while (true) {
    const { value: output } = pid.next(Se * (Game.cpu.bucket - 9500))

    const minLimit = Math.max(15, Game.cpu.limit * 0.2)
    const limit = Math.max(Game.cpu.limit + output - Game.cpu.getUsed(), minLimit)
    // log.info(`[PID] limit: ${limit} out: ${output} min: ${minLimit}`)
    // console.table({e, i, Up, Ui, output, bucket: Game.cpu.bucket, limit})
    yield limit || minLimit
  }
}

function * loopScheduler (threads, limit, state = {}) {
  const queue = shuffle(Array.from(threads.entries()))
  state.queue = queue
  const counts = {}
  const cpu = {}
  const logger = new Logger('[LoopScheduler]')
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
      logger.error(`Error running thread: ${item[0]} ${err.stack || err.message || err}`)
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

export function * restartThread (fn, ...args) {
  while (true) {
    try {
      yield * fn.apply(this, args)
    } catch (err) {
      this.log.error(`Thread '${this.name}' exited with error: ${err.stack || err.message || err}`)
    }
    yield
  }
}

export function * watchdog(name, fn, ...args) {
  while (true) {
    if (!this.hasThread(name)) {
      this.createThread(name, fn, ...args)
    }
    yield
  }
}


export function * threadManager(threads, interval = 5) {
  interval = Math.max(interval, 1)
  while (true) {
    for (const [name, fn, ...args] of threads) {
      if (!this.hasThread(name)) {
        this.createThread(name, fn, ...args)
      }
    }
    yield* sleep(interval)
  }
}