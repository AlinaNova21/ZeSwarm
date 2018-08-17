import Logger from './Logger'

let logger = new Logger('[ExtensionRegistry]')
logger.level = Logger.LogLevel.DEBUG

export class ExtensionRegistry {
  constructor () {
    this.registry = {} // [interfaceId: string]: IPosisExtension } = {}
    this.pre = []
    this.post = []
    this.register('agsExtensionRegistry', this)
    this.register('ags131/ExtensionRegistry', this)
  }
  register (interfaceId, extension) {
    if (this.registry[interfaceId]) {
      logger.warn(`Interface Id already registered: ${interfaceId}`)
    }
    logger.debug(`Registered ${interfaceId}`)
    this.registry[interfaceId] = extension
    if (extension instanceof ExtensionRegistry) return
    if (typeof extension.register === 'function') {
      extension.register()
    }
    if (typeof extension.pretick === 'function') {
      this.pre.push(() => extension.pretick())
    }
    if (typeof extension.posttick === 'function') {
      this.post.unshift(() => extension.posttick())
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
  reboot() {
    Object.keys(this.registry)
      .map(k => this.registry[k])
      .filter(ext => ext.onreboot)
      .forEach(ext => ext.onreboot())
  }
}
