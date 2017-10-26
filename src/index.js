import { BaseKernel } from './zos/BaseKernel'
import { ProcessRegistry } from './zos/ProcessRegistry'
import { ExtensionRegistry } from './zos/ExtensionRegistry'

import { bundle as bin } from './bin/index'
import { bundle as legacy } from './legacy/index'
// import { SpawnExtension } from './bin/SpawnManager'

let extensionRegistry = new ExtensionRegistry()
let processRegistry = new ProcessRegistry()

let pkernel = new BaseKernel(processRegistry, extensionRegistry)

extensionRegistry.register('baseKernel', pkernel)
extensionRegistry.register('sleep', pkernel)

// let spawn = new SpawnExtension({
//   get memory () {
//     Memory.spawnExtension = Memory.spawnExtension || {}
//     return Memory.spawnExtension
//   }
// })
// extensionRegistry.register('spawn', spawn)

processRegistry.install(bin)
processRegistry.install(legacy)

global.kernel = pkernel

export function loop () {
  pkernel.loop()
}
