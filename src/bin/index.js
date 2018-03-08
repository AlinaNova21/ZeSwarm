import Init from './Init'
import IntTest from './IntTest'
import Cron from './Cron'

import Nest from './Nest'
import Swarm from './Swarm'
import ProcessTreeDump from './ProcessTreeDump'
import StackStateCreep from './StackStateCreep'

import { bundle as POSISTest } from './POSISTest'
import { bundle as ags131 } from './ags131'
import { bundle as spawn } from './spawn'

export const bundle = {
  install (processRegistry, extensionRegistry) {
    processRegistry.register('init', Init)
    processRegistry.register('intTest', IntTest)
    processRegistry.register('cron', Cron)
    processRegistry.register('swarm', Swarm)
    processRegistry.register('nest', Nest)
    processRegistry.register('processTreeDump', ProcessTreeDump)
    processRegistry.register('stackStateCreep', StackStateCreep)

    POSISTest.install(processRegistry, extensionRegistry)
    ags131.install(processRegistry, extensionRegistry)
    spawn.install(processRegistry, extensionRegistry)
  }
}
