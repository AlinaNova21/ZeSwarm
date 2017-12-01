import SpawnManager from './SpawnManager'
import SpawnExtension from './SpawnExtension'

export const bundle = {
  install (processRegistry, extensionRegistry) {
    processRegistry.register('spawn/manager', SpawnManager)
    extensionRegistry.register('spawn', new SpawnExtension(extensionRegistry))
  }
}
