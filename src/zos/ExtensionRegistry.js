import Logger from './Logger'

let logger = new Logger('[ExtensionRegistry]')
logger.level = Logger.LogLevel.DEBUG

export class ExtensionRegistry {
  constructor () {
    this.registry = {} // [interfaceId: string]: IPosisExtension } = {}
    this.register('agsExtensionRegistry', this)
    this.register('ags131/ExtensionRegistry', this)
    this.pre = []
    this.post = []
  }
  register (interfaceId, extension) {
    if (this.registry[interfaceId]) {
      logger.warn(`Interface Id already registered: ${interfaceId}`)
    }
    logger.debug(`Registered ${interfaceId}`)
    this.registry[interfaceId] = extension
    if (typeof extension.pretick === 'function') {
      this.pre.push(() => extension.pretick())
    }
    if (typeof extension.posttick === 'function') {
      this.post.push(() => extension.posttick())
    }
    return true
  }
  getExtension (interfaceId) {
    if (!this.registry[interfaceId]) return
    return this.registry[interfaceId]
  }
  pretick() {
    this.pre.forEach(fn => fn())
  }
  posttick() {
    this.post.forEach(fn => fn())
  }
}
