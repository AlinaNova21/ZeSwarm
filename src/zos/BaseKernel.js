import Logger from './Logger'
import InterruptHandler from './InterruptHandler'

import MemoryManager from './MemoryManager'
import Scheduler from './Scheduler'

import C from './constants'

// export interface ProcessInfo {
//   id: PosisPID
//   pid: PosisPID
//   name: string
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
    this.mm.activate(C.KERNEL_SEGMENT)
    this.mem = this.mm.load(C.KERNEL_SEGMENT)
    this.memget = () => this.mem
    this.processRegistry = processRegistry
    this.extensionRegistry = extensionRegistry
    extensionRegistry.register('memoryManager', this.mm)
    this.interruptHandler = new InterruptHandler(() => this.mm.load(C.INTERRUPT_SEGMENT))
    this.processInstanceCache = {}
    this.currentId = 'ROOT'
    this.log = new Logger('[Kernel]')
  }

  UID () {
    return ('P' + Game.time.toString(36).slice(-6) + Math.random().toString(36).slice(-3)).toUpperCase()
  }

  startProcess (imageName, startContext) { // : { pid: PosisPID; process: IPosisProcess; } | undefined {
    let id = this.UID()

    let pinfo = {
      [C.PINFO.ID]: id,
      [C.PINFO.PID]: this.currentId,
      [C.PINFO.NAME]: imageName,
      [C.PINFO.STATUS]: C.PROC_RUNNING,
      [C.PINFO.STARTED]: Game.time
    }
    this.processTable[id] = pinfo
    this.processMemory[pinfo[C.PINFO.ID]] = startContext || {}
    let process = this.createProcess(id)
    this.log.debug(() => `startProcess ${imageName}`)
    this.scheduler.addProcess(id)
    return { pid: id, process }
  }

  createProcess (id) {
    this.log.debug(() => `createProcess ${id}`)
    let pinfo = this.processTable[id]
    if (!pinfo || pinfo[C.PINFO.STATUS] !== C.PROC_RUNNING) throw new Error(`Process ${pinfo[C.PINFO.ID]} ${pinfo[C.PINFO.NAME]} not running`)
    let self = this
    let context = {
      id: pinfo[C.PINFO.ID],
      get parentId () {
        return (self.processTable[id] && self.processTable[id].pid) || ''
      },
      imageName: pinfo[C.PINFO.NAME],
      log: new Logger(`[${pinfo[C.PINFO.ID]}) ${pinfo[C.PINFO.NAME]}]`),
      get memory () {
        self.processMemory[pinfo[C.PINFO.ID]] = self.processMemory[pinfo[C.PINFO.ID]] || {}
        return self.processMemory[pinfo[C.PINFO.ID]]
      },
      queryPosisInterface: self.extensionRegistry.getExtension.bind(self.extensionRegistry)
    }
    Object.freeze(context)
    let process = this.processRegistry.getNewProcess(pinfo[C.PINFO.NAME], context)
    if (!process) throw new Error(`Could not create process ${pinfo[C.PINFO.ID]} ${pinfo[C.PINFO.NAME]}`)
    this.processInstanceCache[id] = { context, process }
    return process
  }

  // killProcess also kills all children of this process
  // note to the wise: probably absorb any calls to this that would wipe out your entire process tree.
  killProcess (id) {
    let pinfo = this.processTable[id]
    if (!pinfo) return
    this.log.warn(() => `killed ${id}`)
    pinfo[C.PINFO.STATUS] = C.PROC_KILLED
    pinfo[C.PINFO.ENDED] = Game.time
    this.interruptHandler.clear(id)
    if (pinfo[C.PINFO.PID] === '') return
    let ids = Object.keys(this.processTable)
    for (let i = 0; i < ids.length; i++) {
      let id = ids[i]
      let pi = this.processTable[id]
      if (pi.pid === pinfo[C.PINFO.ID]) {
        if (pi.status === C.PROC_RUNNING) {
          this.killProcess(id)
        }
      }
    }
  }

  getProcessById (id) {
    return this.processTable[id] &&
      this.processTable[id][C.PINFO.STATUS] === C.PROC_RUNNING &&
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
    if (pinfo[C.PINFO.STATUS] !== C.PROC_RUNNING && pinfo[C.PINFO.ENDED] < Game.time - 100) {
      delete this.processMemory[this.processTable[id].ns]
      delete this.processTable[id]
    }
    if (pinfo[C.PINFO.STATUS] !== C.PROC_RUNNING) return false
    if (func === C.INT_FUNC.WAKE) {
      delete pinfo[C.PINFO.WAIT]
    } else if (pinfo[C.PINFO.WAIT]) {
      return false
    }
    try {
      let proc = this.getProcessById(id)
      if (!proc) throw new Error(`Could not get process ${id} ${pinfo[C.PINFO.NAME]}`)
      if (proc[func]) {
        this.currentId = id
        proc[func](...params)
        this.currentId = 'ROOT'
      }
      return true
    } catch (e) {
      this.killProcess(id)
      this.currentId = 'ROOT'
      pinfo[C.PINFO.ERROR] = e.stack || e.toString()
      this.log.error(() => `[${id}] ${pinfo[C.PINFO.NAME]} crashed\n${e.stack}`)
      return false
    }
  }

  loop () {
    let loopStart = Game.cpu.getUsed()
    let procUsed = 0
    this.mem = this.mm.load(C.KERNEL_SEGMENT)
    this.imem = this.mm.load(C.INTERRUPT_SEGMENT)
    if (this.mem === false || this.imem === false) {
      this.mm.activate(C.KERNEL_SEGMENT)
      this.mm.activate(C.INTERRUPT_SEGMENT)
      this.mm.endOfTick()
      return
    }
    this.memory.processTable = this.memory.processTable || {}
    let interrupts = this.interruptHandler.run(C.INT_STAGE.START)
    _.each(interrupts, ([hook, key]) => {
      let start = Game.cpu.getUsed()
      let func = C.INT_FUNC[hook.func] || hook.func
      let ret = this.runProc(hook.pid, func || C.INT_FUNC.INTERRUPT, { hook, key })
      let end = Game.cpu.getUsed()
      procUsed += end - start
      if (ret === false || hook.func === C.INT_FUNC.WAKE) {
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
        _.each(stats, stat => {
          this.log.debug(`-- ${stat.id} ${stat.cpu.toFixed(3)} ${stat.end.toFixed(3)} ${stat.pinfo[C.PINFO.NAME]}`)
        })
      }
      if (!pid) break
      this.log.debug('process')
      let start = Game.cpu.getUsed()
      this.runProc(pid)
      let end = Game.cpu.getUsed()
      let dur = end - start
      let ts
      let te
      ts = Game.cpu.getUsed()
      this.scheduler.setCPU(pid, dur.toFixed(3))
      let pinfo = this.getProcessById(pid)
      if (pinfo === false) {
        this.log.info(`Stats collection: PID ${pid} was not found`)
        return
      }
      pinfo[C.PINFO.CPU] = dur
      procUsed += dur
      te = Game.cpu.getUsed()
      this.log.debug(() => `${pinfo[C.PINFO.ID]} scheduler setCPU ${(te - ts).toFixed(3)}`)
      ts = Game.cpu.getUsed()
      global.stats.addStat('process', {
        name: pinfo[C.PINFO.NAME]
      }, {
        cpu: dur,
        id: pinfo[C.PINFO.ID],
        parent: pinfo[C.PINFO.PID]
      })
      te = Game.cpu.getUsed()
      this.log.debug(() => `${pinfo[C.PINFO.ID]} influx addStat ${(te - ts).toFixed(3)}`)
      ts = Game.cpu.getUsed()
      stats.push({
        pinfo,
        cpu: dur,
        id: pinfo[C.PINFO.ID],
        end,
        parent: pinfo[C.PINFO.PID]
      })
      te = Game.cpu.getUsed()
      this.log.debug(() => `${pinfo[C.PINFO.ID]} stats push ${(te - ts).toFixed(3)}`)
    }
    this.scheduler.cleanup()
    interrupts = this.interruptHandler.run(C.INT_STAGE.END)
    _.each(interrupts, ([hook, key]) => {
      let start = Game.cpu.getUsed()
      let func = C.INT_FUNC[hook.func] || hook.func
      let ret = this.runProc(hook.pid, func || C.INT_FUNC.INTERRUPT, { hook, key })
      let end = Game.cpu.getUsed()
      procUsed += end - start
      if (ret === false || hook.func === C.INT_FUNC.WAKE) {
        this.interruptHandler.remove(hook.pid, hook.type, hook.stage, hook.key)
      }
    })
    this.mm.save(C.KERNEL_SEGMENT, this.memory)
    this.mm.save(C.INTERRUPT_SEGMENT, this.mm.load(C.INTERRUPT_SEGMENT))
    this.mm.endOfTick()
    let loopEnd = Game.cpu.getUsed()
    let loopDur = loopEnd - loopStart
    let ktime = loopDur - procUsed
    this.log.info(`CPU Used: ${Game.cpu.getUsed().toFixed(3)}, ktime: ${ktime.toFixed(3)}, ptime: ${procUsed.toFixed(3)}, kmem: ${RawMemory.segments[C.KERNEL_SEGMENT].length}`)
  }

  sleep (ticks) {
    this.wait(C.INT_TYPE.SLEEP, C.INT_STAGE.START, Game.time + ticks, C.INT_FUNC.WAKE)
  }

  wait (type, stage, key) {
    this.interruptHandler.add(this.currentId, type, stage, key, C.INT_FUNC.WAKE)
    this.processTable[this.currentId].wait = true
  }

  reboot () {
    this.mm.save(C.KERNEL_SEGMENT, {})
    this.mm.endOfTick()
  }
}
