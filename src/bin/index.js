import Init from './Init'

import { bundle as POSISTest } from './POSISTest'
import { bundle as ags131 } from './ags131'
import { bundle as spawn } from './spawn'
import { bundle as ZeSwarm } from './ZeSwarm'

export const bundle = {
  install (processRegistry, extensionRegistry) {
    processRegistry.register('init', Init)

    POSISTest.install(processRegistry, extensionRegistry)
    ags131.install(processRegistry, extensionRegistry)
    spawn.install(processRegistry, extensionRegistry)
    ZeSwarm.install(processRegistry, extensionRegistry)
  }
}
