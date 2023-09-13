import shuffle from 'lodash/shuffle'
import { Logger, LogLevel } from './log'
import stats from './stats'

type ThreadGeneratorResponse = void | true
type ThreadGenerator = Generator<void, ThreadGeneratorResponse, void>
type ThreadFn = (...args: any[]) => void

type ThreadConstructor = (...args: any[]) => ThreadGenerator

/**
 * @typedef {Generator<void,void,void>} ThreadGenerator
 */
export class Thread<T extends Process = Process> implements Iterable<ThreadGeneratorResponse> {
  private gen: ThreadGenerator
  readonly process: T
  readonly name: string
  readonly fullName: string
  readonly processName: string

  constructor(process: T, name: string, fn: ThreadConstructor, args: any[] = []) {
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

  createThread (name: string, fn: ThreadConstructor, ...args: any[]) {
    return this.process.createThread(name, fn, ...args)
  }

  destroyThread(name: any) {
    return this.process.destroyThread(name)
  }

  hasThread(name: string) {
    return this.process.hasThread(name)
  }

  kill() {
    return this.process.kill()
  }
}
export class Process {
  readonly threads: Set<string> = new Set()
  readonly memory: any = {}
  readonly log: Logger
  readonly kernel: Kernel
  readonly processName: string
  constructor (kernel: Kernel, processName: string) {
    this.kernel = kernel
    this.processName = processName
    this.log = new Logger(`[${processName}]`)
    Object.freeze(this)
  }

  createThread (name: string, fn: ThreadConstructor, ...args: string[]) {
    this.threads.add(name)
    return this.kernel.createThread(this.processName, name, fn, ...args)
  }

  destroyThread (name: string) {
    this.threads.delete(name)
    return this.kernel.destroyThread(`${this.processName}:${name}`)
  }

  hasThread (name: string) {
    return this.kernel.hasThread(`${this.processName}:${name}`)
  }

  kill () {
    for (const name of this.threads) {
      this.destroyThread(name)
    }
  }
}

type SchedulerQueue = [string, Thread][]
type SchedulerState = {
  queue: SchedulerQueue,
  current: string
}

export class Kernel {
  readonly threads = new Map<string, Thread>()
  readonly processes = new Map<string, Process>()
  readonly pidGen = calcCPUPID()
  readonly startTick = Game.time
  readonly log = new Logger('[Kernel]')
  scheduler: SchedulerState
  limitOffset = 0
  constructor () {
    this.log.info(`Kernel Created`)
  }

  tick () {
    if (Game.cpu.bucket < 1000) return
    const uptime = Game.time - this.startTick
    let cnt = 0
    let { value: limit = 0 } = this.pidGen.next()
    if (Game.cpu.bucket < 2000) {
      limit = Math.max(Game.cpu.limit * 0.1, 10)
    }
    limit = Math.max(10, limit - this.limitOffset)
    this.scheduler = {
      queue: [],
      current: ''
    }
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
    this.log.info(`CPU Limit for tick: ${limit.toFixed(2)}/${Game.cpu.limit} (Offset: ${this.limitOffset})  Bucket: ${Game.cpu.bucket}`)
    this.log.log(cnt < this.threads.size ? LogLevel.WARN : LogLevel.INFO, `Uptime: ${uptime}  Threads: ${this.threads.size}  Iterations: ${cnt}`)
    // log.log(cnt < this.threads.size ? LogLevel.WARN : LogLevel.INFO, `Ran ${this.threads. size} threads with a total of ${cnt} iterations`)
  }

  * [Symbol.iterator] () {
    while (true) {
      this.tick()
      yield
    }
  }

  hasThread (name: string) {
    return this.threads.has(name)
  }

  createThread (processName: string, name: string, fn: ThreadConstructor, ...args: any[]) {
    const process = this.processes.get(processName)
    if (!process) throw new Error(`Tried creating thread '${name}' for missing process '${processName}'`)
    const thread = new Thread(process, name, fn, args)
    this.threads.set(thread.fullName, thread)
    if (this.scheduler && this.scheduler.queue) {
      this.scheduler.queue.push([thread.fullName, thread])
    }
  }

  destroyThread (name: string) {
    return this.threads.delete(name)
  }

  hasProcess (name: string) {
    return this.processes.has(name)
  }

  addProcess (name: string, process: Process) {
    this.processes.set(name, process)
  }
  
  createProcess (name: string, fn: ThreadConstructor, ...args: any[]) {
    const process = new Process(this, name)
    this.addProcess(name, process)
    process.createThread('main', fn, ...args)
  }

  destroyProcess (name: string) {
    const proc = this.processes.get(name)
    proc.kill()
    return this.processes.delete(name)
  }
}

export const kernel = new Kernel()

export function * PID (Kp: number, Ki: number, Kd: number, Mi: number, statName: string) {
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
  return 0
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
  return 0
}

function * loopScheduler (threads: Map<string, Thread>, limit: number, state: SchedulerState) {
  const queue: SchedulerQueue = shuffle(Array.from(threads.entries()))
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
      logger.info(`CPU Limit reached! Last thread: ${item[0]}`)
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

/** Sleeps the thread for N ticks */
export function * sleep (ticks: number): ThreadGenerator {
  const end = Game.time + ticks
  while (Game.time < end) yield
}

export function * restartThread (fn: ThreadConstructor, ...args: any[]) {
  while (true) {
    try {
      yield * fn.apply(this, args)
    } catch (err) {
      this.log.error(`Thread '${this.name}' exited with error: ${err.stack || err.message || err}`)
    }
    yield
  }
}

export function * watchdog(name: any, fn: any, ...args: any[]) {
  while (true) {
    if (!this.hasThread(name)) {
      this.createThread(name, fn, ...args)
    }
    yield
  }
}


export function * threadManager(threads: any, interval = 5) {
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