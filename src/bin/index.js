import Init from './Init'
import IntTest from './IntTest'
import Cron from './Cron'

import { bundle as POSISTest } from './POSISTest'
import { bundle as ags131 } from './ags131'

export const bundle = {
  install (registry) {
    registry.register('init', Init)
    registry.register('intTest', IntTest)
    registry.register('cron', Cron)

    POSISTest.install(registry)
    ags131.install(registry)
  }
}
