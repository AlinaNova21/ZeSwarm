import stats from './lib/stats'
import globals from './lib/GlobalTracker'

import prototypes from './prototypes'
import opt from './opt'

import { BaseKernel } from './zos/BaseKernel'
import { ProcessRegistry } from './zos/ProcessRegistry'
import { ExtensionRegistry } from './zos/ExtensionRegistry'

import { bundle as bin } from './bin'
import { bundle as legacy } from './legacy'

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

let off = Math.floor(Math.random() * 10)

export function loop () {
  stats.reset()
  globals.tick()
  extensionRegistry.pretick()  
  pkernel.loop()
  extensionRegistry.posttick()
  if (Game.time % 10 === off) {
    globals.cleanup()
  }
  stats.commit()

  pkernel.log.info(`CPU Used: ${Game.cpu.getUsed()} (FINAL)`)
}
