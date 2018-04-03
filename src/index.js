import stats from './lib/stats'
import globals from './lib/GlobalTracker'
import MemHack from './lib/MemHack'

import prototypes from './prototypes'
import opt from './opt'

import ErrorMapper from './zos/ErrorMapper'
import MemoryManager from './zos/MemoryManager'
import { BaseKernel } from './zos/BaseKernel'
import { ProcessRegistry } from './zos/ProcessRegistry'
import { ExtensionRegistry } from './zos/ExtensionRegistry'

import { bundle as bin } from './bin'
import { bundle as legacy } from './legacy'

import C from './include/constants'

globals.statsDriver = stats

const processRegistry = new ProcessRegistry()
const extensionRegistry = new ExtensionRegistry()

extensionRegistry.register('zos/memHack', MemHack)
extensionRegistry.register('zos/stats', stats)
extensionRegistry.register('zos/globals', globals)

const memoryManager = new MemoryManager()
extensionRegistry.register('segments', {
  posttick() { return memoryManager.posttick() },
  load(id) { return memoryManager.load(id) },
  save(id, value) { return memoryManager.save(id, value) },
  activate(id) { return memoryManager.activate(id) }
})

const kernel = new BaseKernel(processRegistry, extensionRegistry)
function extChange(func, oldExt, newExt) {
  const err = new Error(`'${func}' called on ${oldExt}! Use the '${newExt}' extension instead!`)
  const msg = ErrorMapper.map(err)
  kernel.log.warn(msg)
}
extensionRegistry.register('baseKernel', {
  pretick() { return kernel.pretick() },
  startProcess(imageName, startContext) {    return kernel.startProcess(imageName, startContext)  },
  killProcess(pid) { return kernel.killProcess(pid)  },
  getProcessById(pid) { return kernel.getProcessById(pid) },
  setParent(pid, parentId) { return kernel.setParent(pid, parentId) },
  sleep (time) { 
    extChange('sleep','baseKernel','sleep')
    return kernel.sleep(time)
  },
  setInterrupt (type, stage, key) { 
    extChange('setInterrupt','baseKernel','interrupt')
    return kernel.setInterrupt(type, stage, key) 
  },
  clearInterrupt (type, stage, key) { 
    extChange('clearInterrupt','baseKernel','interrupt')
    return kernel.clearInterrupt(type, stage, key) 
  },
  clearAllInterrupts () { 
    extChange('clearAllInterrupts','baseKernel','interrupt')
    return kernel.clearAllInterrupts() 
  },
  wait (type, stage, key) { 
    extChange('wait','baseKernel','interrupt')
    return kernel.wait(type, stage, key)
  }
})
extensionRegistry.register('sleep', {
  sleep (time) { return kernel.sleep(time) }
})
extensionRegistry.register('interrupt', {
  setInterrupt (type, stage, key) { return kernel.setInterrupt(type, stage, key) },
  clearInterrupt (type, stage, key) { return kernel.clearInterrupt(type, stage, key) },
  clearAllInterrupts () { return kernel.clearAllInterrupts() },
  wait (type, stage, key) { return kernel.wait(type, stage, key) }
})

bin.install(processRegistry, extensionRegistry)
legacy.install(processRegistry, extensionRegistry)

global.kernel = kernel
global.stats = stats
global.C = C

export function loop () {
  extensionRegistry.pretick()  
  kernel.loop()
  extensionRegistry.posttick()
  kernel.log.info(`CPU Used: ${Game.cpu.getUsed()} (FINAL)`)
}
