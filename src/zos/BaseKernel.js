import Logger from './Logger'
import InterruptHandler from './InterruptHandler'

import MemoryManager from './MemoryManager'
import Scheduler from './Scheduler'

const KERNEL_SEGMENT = 1
const INTERRUPT_SEGMENT = 2
// export interface ProcessInfo {
//   id: PosisPID
//   pid: PosisPID
//   name: string
//   ns: string
//   status: string
//   started: number
//   wake?: number
//   ended?: number
//   process?: IPosisProcess
//   error?: string
// }

// export interface ProcessTable {
//   [id: string]: ProcessInfo
// }

// export interface ProcessMemoryTable {
//   [id: string]: {}
// }

// export interface KernelMemory {
//   processTable: ProcessTable
//   processMemory: ProcessMemoryTable
// }

// declare global {
//   interface Memory {
//     kernel: KernelMemory
//   }
// }

export class BaseKernel { // implements IPosisKernel, IPosisSleepExtension {
  get memory () {
    return this.memget()
  }
  get processTable () {
    this.memory.processTable = this.memory.processTable || {}
    return this.memory.processTable
  }
  get processMemory () {
    Memory.zos = Memory.zos || {}
    Memory.zos.processMemory = Memory.zos.processMemory || {}
    return Memory.zos.processMemory
  }

  constructor (processRegistry, extensionRegistry) {
    this.mm = new MemoryManager()
    this.scheduler = new Scheduler(this)
    this.mm.activate(KERNEL_SEGMENT)
    this.mem = this.mm.load(KERNEL_SEGMENT)
    this.memget = () => this.mem
    this.processRegistry = processRegistry
    this.extensionRegistry = extensionRegistry
    extensionRegistry.register('memoryManager', this.mm)
    this.processInstanceCache = {
      // [id: string]: {
      //   context: IPosisProcessContext,
      //   process: IPosisProcess
      // }
    }
    this.currentId = ''
    this.log = new Logger('[Kernel]')
  }

  UID () {
    return ('P' + Game.time.toString(36).slice(-6) + Math.random().toString(36).slice(-3)).toUpperCase()
  }

  startProcess (imageName, startContext) { // : { pid: PosisPID; process: IPosisProcess; } | undefined {
    let id = this.UID()

    let pinfo = {
      id: id,
      pid: this.currentId,
      name: imageName,
      ns: `ns_${id}`,
      status: 'running',
      started: Game.time
    }
    this.processTable[id] = pinfo
    this.processMemory[pinfo.ns] = startContext || {}
    let process = this.createProcess(id)
    this.log.debug(() => `startProcess ${imageName}`)
    return { pid: id, process }
  }

  createProcess (id) {
    this.log.debug(() => `createProcess ${id}`)
    let pinfo = this.processTable[id]
    if (!pinfo || pinfo.status !== 'running') throw new Error(`Process ${pinfo.id} ${pinfo.name} not running`)
    let self = this
    let context = {
      id: pinfo.id,
      get parentId () {
        return (self.processTable[id] && self.processTable[id].pid) || ''
      },
      imageName: pinfo.name,
      log: new Logger(`[${pinfo.id}) ${pinfo.name}]`),
      get memory () {
        self.processMemory[pinfo.ns] = self.processMemory[pinfo.ns] || {}
        return self.processMemory[pinfo.ns]
      },
      queryPosisInterface: self.extensionRegistry.getExtension.bind(self.extensionRegistry)
    }
    Object.freeze(context)
    let process = this.processRegistry.getNewProcess(pinfo.name, context)
    if (!process) throw new Error(`Could not create process ${pinfo.id} ${pinfo.name}`)
    this.processInstanceCache[id] = { context, process }
    return process
  }
  // killProcess also kills all children of this process
  // note to the wise: probably absorb any calls to this that would wipe out your entire process tree.
  killProcess (id) {
    let pinfo = this.processTable[id]
    if (!pinfo) return
    this.log.warn(() => `killed ${id}`)
    pinfo.status = 'killed'
    pinfo.ended = Game.time
    this.interruptHandler.clear(id)
    if (pinfo.pid === '') return
    let ids = Object.keys(this.processTable)
    for (let i = 0; i < ids.length; i++) {
      let id = ids[i]
      let pi = this.processTable[id]
      if (pi.pid === pinfo.id) {
        if (pi.status === 'running') {
          this.killProcess(id)
        }
      }
    }
  }

  getProcessById (id) {
    return this.processTable[id] &&
      this.processTable[id].status === 'running' &&
      ((this.processInstanceCache[id] &&
        this.processInstanceCache[id].process) ||
        this.createProcess(id))
  }

  // passing undefined as parentId means 'make me a root process'
  // i.e. one that will not be killed if another process is killed
  setParent (id, parentId = 'ROOT') {
    if (!this.processTable[id]) return false
    this.processTable[id].pid = parentId
    return true
  }

  setInterrupt (type, stage, key) {
    return this.interruptHandler.add(this.currentId, type, stage, key)
  }

  clearInterrupt (type, stage, key) {
    return this.interruptHandler.remove(this.currentId, type, stage, key)
  }
  clearAllInterrupts () {
    return this.interruptHandler.clear(this.currentId)
  }

  runProc (id, func = 'run', ...params) {
    let pinfo = this.processTable[id]
    if (!pinfo) return false
    if (pinfo.status !== 'running' && pinfo.ended < Game.time - 100) {
      delete this.processMemory[this.processTable[id].ns]
      delete this.processTable[id]
    }
    if (pinfo.status !== 'running') return false
    if (func === 'wake') {
      delete pinfo.wait
    } else if (pinfo.wait) {
      return false
    }
    try {
      let proc = this.getProcessById(id)
      if (!proc) throw new Error(`Could not get process ${id} ${pinfo.name}`)
      if (proc[func]) {
        this.currentId = id
        proc[func](...params)
        this.currentId = 'ROOT'
      }
      return true
    } catch (e) {
      this.killProcess(id)
      this.currentId = 'ROOT'
      pinfo.status = 'crashed'
      pinfo.error = e.stack || e.toString()
      this.log.error(() => `[${id}] ${pinfo.name} crashed\n${e.stack}`)
      return false
    }
  }

  loop () {
    let loopStart = Game.cpu.getUsed()
    let procUsed = 0
    this.mem = this.mm.load(KERNEL_SEGMENT)
    this.imem = this.mm.load(INTERRUPT_SEGMENT)
    if (this.mem === false || this.imem === false) {
      this.mm.activate(KERNEL_SEGMENT)
      this.mm.activate(INTERRUPT_SEGMENT)
      this.mm.endOfTick()
      return
    }
    this.memory.processTable = this.memory.processTable || {}
    this.memory.processMemory = this.memory.processMemory || {}
    this.memory.interruptHandler = this.memory.interruptHandler || {}
    if (!this.interruptHandler) {
      this.interruptHandler = new InterruptHandler(() => this.mm.load(INTERRUPT_SEGMENT))
    }
    let interrupts = this.interruptHandler.run('start')
    interrupts.forEach(([hook, key]) => {
      let start = Game.cpu.getUsed()
      let ret = this.runProc(hook.pid, hook.func || 'interrupt', { hook, key })
      let end = Game.cpu.getUsed()
      procUsed += end - start
      if (ret === false || hook.func === 'wake') {
        this.interruptHandler.remove(hook.pid, hook.type, hook.stage, hook.key)
      }
    })
    this.scheduler.setup()

    if (_.size(this.processTable) === 0) {
      this.startProcess('init', {})
    }

    let stats = []
    this.log.debug('loop')
    while (true) {
      let pid = this.scheduler.getNextProcess()
      this.log.debug('pid', pid)
      if (pid === false) { // Hard stop
        stats.forEach(stat => {
          this.log.debug(`-- ${stat.id} ${stat.cpu.toFixed(3)} ${stat.end.toFixed(3)} ${stat.pinfo.name}`)
        })
      }
      if (!pid) break
      this.log.debug('process')
      let start = Game.cpu.getUsed()
      this.runProc(pid)
      let pinfo = this.getProcessById(pid)
      let end = Game.cpu.getUsed()
      let dur = end - start
      let ts
      let te
      ts = Game.cpu.getUsed()
      this.scheduler.setCPU(pid, dur.toFixed(3))
      pinfo.cpu = dur
      procUsed += dur
      te = Game.cpu.getUsed()
      this.log.debug(() => `${pinfo.id} scheduler setCPU ${(te - ts).toFixed(3)}`)
      ts = Game.cpu.getUsed()
      global.stats.addStat('process', {
        name: pinfo.name
      }, {
        cpu: dur,
        id: pinfo.id,
        parent: pinfo.parentPID
      })
      te = Game.cpu.getUsed()
      this.log.debug(() => `${pinfo.id} influx addStat ${(te - ts).toFixed(3)}`)
      ts = Game.cpu.getUsed()
      stats.push({
        pinfo,
        cpu: dur,
        id: pinfo.id,
        end,
        parent: pinfo.parentPID
      })
      te = Game.cpu.getUsed()
      this.log.debug(() => `${pinfo.id} stats push ${(te - ts).toFixed(3)}`)
    }
    this.scheduler.cleanup()
    // let ids = Object.keys(this.processTable)
    // if (ids.length === 0) {
    //   let proc = this.startProcess('init', {})
    //   // Due to breaking changes in the standard,
    //   // init can no longer be ran on first tick.
    //   if (proc) ids.push(proc.pid.toString())
    // }
    // for (let i = 0; i < ids.length; i++) {
    //   let id = ids[i]
    //   if (this.runProc(id)) {
    //     runCnt++
    //   }
    // }
    let i2start = Game.cpu.getUsed()
    interrupts = this.interruptHandler.run('end')
    interrupts.forEach(([hook, key]) => {
      let start = Game.cpu.getUsed()
      let ret = this.runProc(hook.pid, hook.func || 'interrupt', { hook, key })
      let end = Game.cpu.getUsed()
      procUsed += end - start
      if (ret === false || hook.func === 'wake') {
        this.interruptHandler.remove(hook.pid, hook.type, hook.stage, hook.key)
      }
    })
    this.mm.save(KERNEL_SEGMENT, this.memory)
    this.mm.save(INTERRUPT_SEGMENT, this.mm.load(INTERRUPT_SEGMENT))
    this.mm.endOfTick()
    let loopEnd = Game.cpu.getUsed()
    let loopDur = loopEnd - loopStart
    let ktime = loopDur - procUsed
    this.log.info(`CPU Used: ${Game.cpu.getUsed().toFixed(3)}, ktime: ${ktime.toFixed(3)}, ptime: ${procUsed.toFixed(3)}, kmem: ${RawMemory.segments[KERNEL_SEGMENT].length}`)
  }

  sleep (ticks) {
    this.wait('sleep', 'start', Game.time + ticks, 'wake')
  }

  wait (type, stage, key) {
    this.interruptHandler.add(this.currentId, type, stage, key, 'wake')
    this.processTable[this.currentId].wait = true
  }

  reboot () {
    this.mm.save(KERNEL_SEGMENT, {})
    this.mm.endOfTick()
  }
}
