import Init from './Init'
import IntTest from './IntTest'
import ErrTest from './ErrTest'
import Cron from './Cron'

import ProcessTreeDump from './ProcessTreeDump'

import { bundle as POSISTest } from './POSISTest'
import { bundle as ags131 } from './ags131'
import { bundle as spawn } from './spawn'
import { bundle as ZeSwarm } from './ZeSwarm'

export const bundle = {
  install (processRegistry, extensionRegistry) {
    processRegistry.register('init', Init)
    processRegistry.register('intTest', IntTest)
    processRegistry.register('errTest', ErrTest)
    processRegistry.register('cron', Cron)
    processRegistry.register('processTreeDump', ProcessTreeDump)

    POSISTest.install(processRegistry, extensionRegistry)
    ags131.install(processRegistry, extensionRegistry)
    spawn.install(processRegistry, extensionRegistry)
    ZeSwarm.install(processRegistry, extensionRegistry)
  }
}
