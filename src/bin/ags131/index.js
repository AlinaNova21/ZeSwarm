import IntTest from './IntTest'
import ErrTest from './ErrTest'
import ProcessTreeDump from './ProcessTreeDump'

import { bundle as SleeperTest } from './SleeperTest'
import { bundle as CronTest } from './CronTest'
import { bundle as SpawnTest } from './SpawnTest'

export const bundle = {
  install (processRegistry, extensionRegistry) {
    processRegistry.register('ags131/intTest', IntTest)
    processRegistry.register('ags131/errTest', ErrTest)
    processRegistry.register('ags131/processTreeDump', ProcessTreeDump)

    SleeperTest.install(processRegistry, extensionRegistry)
    CronTest.install(processRegistry, extensionRegistry)
    SpawnTest.install(processRegistry, extensionRegistry)
  }
}
