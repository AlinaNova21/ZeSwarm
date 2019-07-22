import { Logger } from './log'

const log = new Logger('[kernel]')

export class Kernel {
  constructor () {
    this.threads = new Map()
    log.info(`Kernel Created`)
  }

  tick () {
    if (!this.threads.has('kBase')) {
      log.info('Starting kBase')
      this.threads.set('kBase', kernelBase(this))
    }
    log.info(`threads: ${[...this.threads.keys()]}`)
    let cnt = 0
    const scheduler = loopScheduler(this.threads)
    for (const _val of scheduler) { // eslint-disable-line no-unused-vars
      // log.info(`tick ${val}`)
      cnt++
    }
    log.info(`Ran ${this.threads.size} threads with a total of ${cnt} iterations`)
  }

  next (val) {
    if (val === true) {
      this.scheduler = loopScheduler(this.threads)
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
    this.threads.set(name, gen)
  }

  destroyThread (name) {
    return this.threads.delete(name)
  }
}

export const kernel = new Kernel()

function * kernelBase (kernel) {
  const ctx = { kernel }
  const baseThreads = [
    ['kTest', kTest]
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

function * counter (end, start = 0, step = 1) {
  for (let i = start; i < end; i += step) {
    yield i
  }
}

function * kTest () {
  while (true) {
    log.info(`[kTest] ${Game.time}`)
    // for (const v of counter(10)) {
    //   log.info(`[kTest] ${v}`)
    //   yield true
    // }
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

function * loopScheduler (threads) {
  const queue = Array.from(threads.entries())
  for (const item of queue) {
    if (Game.cpu.getUsed() > Game.cpu.limit) {
      log.info(`[loopScheduler] CPU Limit reached`)
    }
    // log.info(`[loopScheduler] Running ${item[0]}`)
    const { done, value } = item[1].next()
    if (!done && value === true) {
      queue.push(item)
    }
    if (done) {
      threads.delete(item[0])
    }
    yield
  }
}

export function * sleep (ticks) {
  const end = Game.time + ticks
  while (Game.time < end) yield
}
