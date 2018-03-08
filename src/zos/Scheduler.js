import Logger from './Logger'
import C from './constants'

const BURST_CPU_LIMIT = 300 // new-global burst limit
const BURST_BUCKET_LIMIT = 2000 // Only new-global burst above this

const calcCPULinear = () => Game.cpu.bucket < 500 ? 0 : Game.cpu.limit * ((((Game.cpu.bucket - 1000) * (1.1 - 0.4)) / 9000) + 0.4)
const calcCPUPID = (mem) => {
  const Kp = 0.03
  const Ki = 0.02
  const Kd = 0
  const Mi = 500
  const Se = 0.5

  let e = mem.e || 0
  let i = mem.i || 0
  let le = e
  e = Se * (Game.cpu.bucket - 9500)
  i = i + e
  i = Math.min(Math.max(i, -Mi), Mi)

  let Up = (Kp * e)
  let Ui = (Ki * i)
  let Ud = Kd * (e / le) * e

  const output = Up + Ui + Ud

  mem.i = i
  mem.e = e

  const limit = Math.max(Game.cpu.limit + output - Game.cpu.getUsed(), Game.cpu.limit * 0.2)
  // console.table({e, i, Up, Ui, output, bucket: Game.cpu.bucket, limit})

  return limit
}

// These lines are just to make standard happy
calcCPULinear({})
calcCPUPID({})

const calcCPU = calcCPUPID

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

    maxCPU = calcCPU(this.mem)

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
    return this.cnt
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
