import { bundle as SleeperTest } from './SleeperTest'
import { bundle as CronTest } from './CronTest'

export const bundle = {
  install (registry) {
    SleeperTest.install(registry)
    CronTest.install(registry)
  }
}
