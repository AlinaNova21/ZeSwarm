import Nest from './Nest'
import Swarm from './Swarm'
import StackStateCreep from './StackStateCreep'
import HarvestManager from './HarvestManager'
import Intel from './Intel'
import Cron from './Cron'

export const bundle = {
  install (processRegistry, extensionRegistry) {
    processRegistry.register('ZeSwarm/swarm', Swarm)
    processRegistry.register('ZeSwarm/nest', Nest)
    processRegistry.register('ZeSwarm/stackStateCreep', StackStateCreep)
    processRegistry.register('ZeSwarm/harvestManager', HarvestManager)
    processRegistry.register('ZeSwarm/intel', Intel)
    processRegistry.register('ZeSwarm/cron', Cron)
  }
}
