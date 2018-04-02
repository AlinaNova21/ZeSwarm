import stats from './lib/stats'
import globals from './lib/GlobalTracker'
import MemHack from './lib/MemHack'

import prototypes from './prototypes'
import opt from './opt'

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
    let err = new Error()
    console.log(`DEPRECATED: memoryManager ${err.stack}`)
    return target[name]
  }
}))

extensionRegistry.register('etc', etc)

const kernel = new BaseKernel(processRegistry, extensionRegistry)
extensionRegistry.register('baseKernel', kernel)
extensionRegistry.register('sleep', kernel)
extensionRegistry.register('interrupt', kernel)

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
