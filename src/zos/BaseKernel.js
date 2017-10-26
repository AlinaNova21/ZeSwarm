import Logger from './Logger'
import InterruptHandler from './InterruptHandler'

import MemoryManager from './MemoryManager'

const KERNEL_SEGMENT = 1
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
    Memory.zos = Memory.zos || {}
    Memory.zos.kernel = Memory.zos.kernel || { processTable: {}, processMemory: {} }
    return Memory.zos.kernel
  }
  get processTable () {
    this.memory.processTable = this.memory.processTable || {}
    return this.memory.processTable
  }
  get processMemory () {
    this.memory.processMemory = this.memory.processMemory || {}
    return this.memory.processMemory
  }

  constructor (processRegistry, extensionRegistry) {
    this.mm = new MemoryManager()
    this.mm.activate(KERNEL_SEGMENT)
    this.mem = this.mm.load(KERNEL_SEGMENT)
    this.memget = () => this.mem
    this.processRegistry = processRegistry
    this.extensionRegistry = extensionRegistry
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
    this.mem = this.mm.load(KERNEL_SEGMENT)
    console.log(this.mem)
    if (this.mem === false) {
      this.mm.activate(KERNEL_SEGMENT)
      this.mm.endOfTick()
      return
    }
    this.memory.processTable = this.memory.processTable || {}
    this.memory.processMemory = this.memory.processMemory || {}
    this.memory.interruptHandler = this.memory.interruptHandler || {}
    if (!this.interruptHandler) {
      this.interruptHandler = new InterruptHandler(() => this.memory.interruptHandler)
    }
    let interrupts = this.interruptHandler.run('start')
    interrupts.forEach(([hook, key]) => {
      let ret = this.runProc(hook.pid, hook.func || 'interrupt', { hook, key })
      if (ret === false) {
        this.interruptHandler.remove(hook.pid, hook.type, hook.stage, hook.key)
      }
    })
    let ids = Object.keys(this.processTable)
    if (ids.length === 0) {
      let proc = this.startProcess('init', {})
      // Due to breaking changes in the standard,
      // init can no longer be ran on first tick.
      if (proc) ids.push(proc.pid.toString())
    }
    let runCnt = 0
    for (let i = 0; i < ids.length; i++) {
      let id = ids[i]
      if (this.runProc(id)) {
        runCnt++
      }
    }
    if (runCnt === 0) {
      this.startProcess('init', {})
    }
    interrupts = this.interruptHandler.run('end')
    interrupts.forEach(([hook, key]) => {
      let ret = this.runProc(hook.pid, hook.func || 'interrupt', { hook, key })
      if (ret === false) {
        this.interruptHandler.remove(hook.pid, hook.type, hook.stage, hook.key)
      }
    })
    this.mm.save(KERNEL_SEGMENT, this.memory)
    this.mm.endOfTick()
  }

  sleep (ticks) {
    let pinfo = this.processTable[this.currentId]
    if (!pinfo) return
    pinfo.wake = Game.time + ticks
  }

  wait (type, stage, key) {
    this.interruptHandler.add(this.currentId, type, stage, key, 'wake')
    this.processTable[this.currentId].wait = true
  }
}
