import stats from './lib/stats'
import globals from './lib/GlobalTracker'

import { BaseKernel } from './zos/BaseKernel'
import { ProcessRegistry } from './zos/ProcessRegistry'
import { ExtensionRegistry } from './zos/ExtensionRegistry'

import { bundle as bin } from './bin/index'
import { bundle as legacy } from './legacy/index'

import etc from './etc'
import C from './include/constants'

globals.statsDriver = stats
globals.init()

// import { SpawnExtension } from './bin/SpawnManager'

let extensionRegistry = new ExtensionRegistry()
let processRegistry = new ProcessRegistry()

let pkernel = new BaseKernel(processRegistry, extensionRegistry)

extensionRegistry.register('baseKernel', pkernel)
extensionRegistry.register('sleep', pkernel)
extensionRegistry.register('interrupt', pkernel)
extensionRegistry.register('etc', etc)

bin.install(processRegistry, extensionRegistry)
legacy.install(processRegistry, extensionRegistry)

global.kernel = pkernel
global.stats = stats
global.C = C

export function loop () {
  stats.reset()
  globals.tick()
  pkernel.loop()
  stats.commit()

  pkernel.log.info(`CPU Used: ${Game.cpu.getUsed()} (FINAL)`)
}
