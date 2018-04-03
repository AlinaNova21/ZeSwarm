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

import etc from './etc'
import C from './include/constants'

globals.statsDriver = stats

const processRegistry = new ProcessRegistry()
const extensionRegistry = new ExtensionRegistry()

extensionRegistry.register('zos/memHack', MemHack)
extensionRegistry.register('zos/stats', stats)
extensionRegistry.register('zos/globals', globals)

const memoryManager = new MemoryManager()
extensionRegistry.register('segments', memoryManager)
extensionRegistry.register('memoryManager', new Proxy(memoryManager, {
  get (target, name) {
    if(['register', 'pretick', 'posttick'].includes(name)) {
      return
    }
    const err = new Error()
    const msg = ErrorMapper.map(err)
    console.log(`DEPRECATED: memoryManager ${msg}`)
    return target[name]
  }
}))

extensionRegistry.register('etc', etc)


const kernel = new BaseKernel(processRegistry, extensionRegistry)
function extChange(func, oldExt, newExt) {
  const err = new Error(`'${func}' called on ${oldExt}! Use the '${newExt}' extension instead!`)
  const msg = ErrorMapper.map(err)
  kernel.log.warn(msg)
}
extensionRegistry.register('baseKernel', {
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
    return this.kernel.setInterrupt(type, stage, key) 
  },
  clearInterrupt (type, stage, key) { 
    extChange('clearInterrupt','baseKernel','interrupt')
    return this.kernel.clearInterrupt(type, stage, key) 
  },
  clearAllInterrupts () { 
    extChange('clearAllInterrupts','baseKernel','interrupt')
    return this.kernel.clearAllInterrupts() 
  },
  wait (type, stage, key) { 
    extChange('wait','baseKernel','interrupt')
    return this.kernel.wait(type, stage, key)
  }
})
extensionRegistry.register('sleep', {
  sleep (time) { return kernel.sleep(time) }
})
extensionRegistry.register('interrupt', {
  setInterrupt (type, stage, key) { return this.kernel.setInterrupt(type, stage, key) },
  clearInterrupt (type, stage, key) { return this.kernel.clearInterrupt(type, stage, key) },
  clearAllInterrupts () { return this.kernel.clearAllInterrupts() },
  wait (type, stage, key) { return this.kernel.wait(type, stage, key) }
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
