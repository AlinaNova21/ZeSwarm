import Logger from './Logger'
import C from './constants'

// https://docs.google.com/spreadsheets/d/1qw1KppNsfHE5qolZM5hDeoF5v_lqSmUJUlr6MW0eeoE/edit#gid=0
const MIN_NORM_CPU_PERC = 0.5   // K3
const GCL_FACTOR = 0.92     // K4
const MAX_DROP = 10     // K5
const MAX_MOVE_RANGE = 50   // K6
// const BUCKET_LOW = 4000     // K7
const BUCKET_HIGH = 9500    // K8
const GCL_CPU_LEVEL = Game.cpu.limit  // K9
const MAX_NORM_CPU = Math.max(GCL_CPU_LEVEL * GCL_FACTOR, GCL_CPU_LEVEL - MAX_DROP)
const MIN_NORM_CPU = Math.max(Math.floor(MAX_NORM_CPU * MIN_NORM_CPU_PERC), MAX_NORM_CPU - MAX_MOVE_RANGE)
const MOVE_RANGE = MAX_NORM_CPU - MIN_NORM_CPU

const OVERHEAD_ADJ = 10

const BURST_CPU_LIMIT = 300 // new-global burst limit
const BURST_BUCKET_LIMIT = 2000 // Only new-global burst above this

const bucketPerc = () => Math.max(0, Game.cpu.bucket / BUCKET_HIGH)
const scaledLog10Perc = () => Math.min(1, Math.max(0, Math.log10(((0.9 * bucketPerc()) * 100) + 10) - 1))
const calcCPU2 = () => Game.cpu.bucket < 500 ? 0 : Math.floor(MIN_NORM_CPU + (scaledLog10Perc() * MOVE_RANGE)) - OVERHEAD_ADJ

const calcCPU1 = () => Game.cpu.bucket < 500 ? 0 : Game.cpu.limit * ((((Game.cpu.bucket - 1000) * (1.1 - 0.4)) / 9000) + 0.4)

// These lines are just to make standard happy
calcCPU1()
calcCPU2()

const calcCPU = calcCPU1

const QUEUE_COUNT = 10

let formula = (i) => 0.05 * i

let amts = []
for (let i = 0; i < QUEUE_COUNT; i++) {
  amts.push(formula(i))
}

const QUEUE_CPU_AMT = amts
// Based on https://www.wikiwand.com/en/Multilevel_feedback_queue#/Process_Scheduling

export default class Scheduler {
  constructor (kernel, opts = {}) {
    this.kernel = kernel
    this.opts = opts
    this.startTick = true
    this.idCache = {}
    this.log = new Logger('[Scheduler]')
  }
  get mem () {
    this.kmem.scheduler = this.kmem.scheduler || {}
    return this.kmem.scheduler
  }
  get kmem () {
    return this.kernel.memory
  }
  get procs () {
    return this.kernel.processTable
  }
  clear () {
    let qs = []
    _.times(QUEUE_COUNT, () => qs.push([]))
    this.mem.queues = qs
    this.idCache = {}
  }
  setup () {
    let start = Game.cpu.getUsed()
    this.usedQueueCPU = 0
    this.cnt = 0
    let maxCPU = Game.cpu.limit
    this.queues = []
    _.times(QUEUE_COUNT, () => this.queues.push([]))

    _.each(this.procs, proc => {
      proc._s = proc._s || { q: 0 }
      if (!proc[C.PINFO.ID] || proc[C.PINFO.STATUS] !== C.PROC_RUNNING) {
        return
      }
      let q = proc._s.q || 0
      if (q < 0) q = 0
      if (q >= QUEUE_COUNT) q = QUEUE_COUNT - 1
      this.queues[q].push(proc)
      this.cnt++
    })

    maxCPU = calcCPU()

    if (this.startTick && Game.cpu.bucket > BURST_BUCKET_LIMIT) {
      maxCPU = BURST_CPU_LIMIT
    }

    this.remainingCPU = Math.min(maxCPU, Game.cpu.bucket)
    this.mem.lastRem = this.remainingCPU
    this.queue = 0
    this.index = 0
    this.stats = {}
    this.done = []
    this.cpu = {}
    this.ql = this.queues.map(q => q.length)
    let end = Game.cpu.getUsed()
    let dur = end - start
    this.log.info(`Setup Time: ${dur.toFixed(3)}   Total Queue Length: ${this.cnt}`)
  }
  addProcess (proc) {
    proc._s = proc._s || { q: 0 }
    this.queues[this.queue].push(proc)
  }
  removeProcess (pid) {
    let p = this.procs[pid]
    let ind = this.queues[p._s.q].indexOf(p)
    if (ind > -1) {
      this.queues[p._s.q].splice(ind, 1)
    }
  }
  getNextProcess () {
    while (this.queues[this.queue].length === 0) {
      if (this.queue === QUEUE_COUNT - 1) {
        return false
      }
      this.queue++
    }
    let queue = this.queues[this.queue]
    let queueCPU = QUEUE_CPU_AMT[this.queue]
    this.usedQueueCPU += queueCPU
    let proc = queue.pop()
    let pid = proc[C.PINFO.ID]
    let avail = this.remainingCPU - Math.max(Game.cpu.getUsed(), this.usedQueueCPU)
    if (avail < 0) {
      this.log.error(`CPU Threshhold reached. Used:${Game.cpu.getUsed()} Allowance:${Math.round(this.remainingCPU * 100) / 100} Avail: ${Math.round(avail * 100) / 100} Bucket:${Game.cpu.bucket} QueueCPU: ${queueCPU} UsedQueueCPU: ${Math.round(this.usedQueueCPU * 100) / 100}`)
      this.log.error(`Queue: ${this.queue}. Index: ${this.index}/${queue.length} LastPID: ${pid}`)
      return false
    }
    this.done.push(proc)
    return pid
  }
  setCPU (pid, v) {
    this.procs[pid]._s.c = v
  }
  setMeta (pid, meta) {}
  cleanup () {
    let start = Game.cpu.getUsed()
    let pro, queue
    let runcnt = this.done.length
    let procnt = 0
    let demcnt = 0
    while (this.queue < QUEUE_COUNT) {
      if (this.queue === 0) break
      queue = this.queues[this.queue]
      if (queue.length && Math.random() < 0.50) {
        pro = queue.pop()
        this.queues[this.queue - 1].push(pro)
        procnt++
      }
      this.queue++
    }

    while (this.done.length) {
      let pid = this.done.pop()
      // let p = this.procs[pid]
      let p = pid
      if (!p) {
        this.log.warn(`PID ${pid} not found`)
        continue
      }
      let {q, c} = p._s = p._s || { q: 0, c: 0}
      if (q > 0 && c < (QUEUE_CPU_AMT[q - 1] * 0.75)) {
        if (Math.random() < 0.50) continue
        p._s.q--
        procnt++
      } else if (q < (QUEUE_COUNT - 1) && c > QUEUE_CPU_AMT[q]) {
        p._s.q++
        demcnt++
      }
    }

    this.startTick = false
    let end = Game.cpu.getUsed()
    let cur = end - start
    this.log.info(QUEUE_CPU_AMT.map(v => v.toFixed(2)).join(', '))
    this.log.info(this.ql.map(q => ('    ' + q).slice(-4)).join(', '))
    this.log.info(`Promoted: ${procnt} Demoted: ${demcnt}`)
    this.log.info(`Counts: ${runcnt}/${this.cnt} (${Math.floor((runcnt / this.cnt) * 100)}%) ${this.cnt - runcnt} rem`)
    if (global.stats) {
      global.stats.addStat('scheduler', {
        v: 3
      }, {
        count: QUEUE_COUNT,
        queue: this.queue,
        promoted: procnt,
        demoted: demcnt,
        cleanupCPU: cur,
        processCount: this.cnt,
        runCnt: runcnt
      })
      this.ql.forEach((q, i) => {
        global.stats.addStat('schedulerQueue', {
          level: i
        }, {
          level: i,
          count: q
        })
      })
    }
  }
}
