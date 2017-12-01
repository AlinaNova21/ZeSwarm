import Init from './Init'
import IntTest from './IntTest'
import Cron from './Cron'

import { bundle as POSISTest } from './POSISTest'
import { bundle as ags131 } from './ags131'
import { bundle as spawn } from './spawn'

export const bundle = {
  install (processRegistry, extensionRegistry) {
    processRegistry.register('init', Init)
    processRegistry.register('intTest', IntTest)
    processRegistry.register('cron', Cron)

    POSISTest.install(processRegistry, extensionRegistry)
    ags131.install(processRegistry, extensionRegistry)
    spawn.install(processRegistry, extensionRegistry)
  }
}
