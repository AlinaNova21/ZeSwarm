import { bundle as SleeperTest } from './SleeperTest'
import { bundle as CronTest } from './CronTest'
import { bundle as SpawnTest } from './SpawnTest'

export const bundle = {
  install (processRegistry, extensionRegistry) {
    SleeperTest.install(processRegistry, extensionRegistry)
    CronTest.install(processRegistry, extensionRegistry)
    SpawnTest.install(processRegistry, extensionRegistry)
  }
}
