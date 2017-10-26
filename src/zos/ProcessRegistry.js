import Logger from './Logger'

let logger = new Logger('[ProcessRegistry]')
logger.level = Logger.LogLevel.DEBUG

export class ProcessRegistry {
  constructor () {
    this.registry = {} // { [name: string]: PosisProcessConstructor } = {}
  }
  register (name, constructor) {
    if (this.registry[name]) {
      logger.error(`Name already registered: ${name}`)
      return false
    }
    logger.debug(`Registered ${name}`)
    this.registry[name] = constructor
    return true
  }
  install (bundle) {
    bundle.install(this)
  }
  getNewProcess (name, context) {
    if (!this.registry[name]) return
    logger.debug(`Created ${name}`)
    return new this.registry[name](context)
  }
}
