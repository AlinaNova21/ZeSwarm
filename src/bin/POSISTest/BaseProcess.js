// From unfleshedone
// Root process expects to be started with 'startContext = { maxRunTime: N }'

class POSISTestBaseProcess {
  static get ImageName () { return 'POSISTest/PosisBaseTestProcess' }
  constructor (context) {
    this.context = context
    this.testName = 'POSIS base:'
  }

  get tmemory () {
    return this.memory
  }

  run () {
    let kernel = this.context.queryPosisInterface('baseKernel')
    let fatal = false

    if (this.log === undefined) {
      throw Error(`${this.testName}: 'log' is not set`)
    }

    if (this.memory === undefined) {
      this.log.error(`${this.testName}: 'memory' not set`)
      fatal = true
    }

    this.log.error(`${this.testName}: starting basic diagnostics`)

    this.log.debug(`${this.testName}: debug message`)
    this.log.debug(() => `${this.testName}: deferred debug message`)
    this.log.info(`${this.testName}: info message`)
    this.log.info(() => `${this.testName}: deferred info message`)
    this.log.warn(`${this.testName}: warn message`)
    this.log.warn(() => `${this.testName}: deferred warn message`)
    this.log.error(`${this.testName}: error message`)
    this.log.error(() => `${this.testName}: deferred error message`)

    if (this.imageName === undefined) {
      this.log.error(`${this.testName}: 'imageName' not set`)
    }

    if (this.imageName !== POSISTestBaseProcess.ImageName) {
      this.log.error(`${this.testName}: 'imageName' not matching, expected: '${POSISTestBaseProcess.ImageName}', actual '${this.imageName}'`)
    }

    if (this.id === undefined) {
      this.log.error(`${this.testName}: 'id' not set`)
    }

    if (this.parentId === undefined) {
      this.log.error(`${this.testName}: 'parentId' not set`)
    }

    this.log.error(`${this.testName}: basic diagnostics completed`)

    if (fatal) {
      this.log.error(`${this.testName}: fatal errors, trying to exit`)
      kernel.killProcess(this.id)
      return
    }

    if (this.tmemory.started === undefined) {
      this.tmemory.started = Game.time
      this.tmemory.lastTick = Game.time
    }

    if (this.tmemory.supposedToBeDead) {
      this.log.error(`${this.testName}: can't exit`)
    }

    this.log.info(`${this.testName}: started on ${this.tmemory.started}, running for ${Game.time - this.tmemory.started}`)

    if (this.tmemory.maxRunTime === undefined) {
      this.log.error(`${this.testName}: 'maxRunTime' is not set, arguments are not passed, or broken`)
      return
    }

    if (Game.time - this.tmemory.started >= this.tmemory.maxRunTime) {
      this.tmemory.supposedToBeDead = true
      kernel.killProcess(this.id)
    }

    this.tmemory.lastTick = Game.time
  }

  // ==================================
  // Host OS is providing everything below
  get memory () { // private memory
    return this.context.memory
  }
  get imageName () { // image name (maps to constructor)
    return this.context.imageName
  }
  get id () { // ID
    return this.context.id
  }
  get parentId () { // Parent ID
    return this.context.parentId
  }
  get log () { // Logger
    return this.context.log
  }
}

// tslint:disable-next-line:max-classes-per-file
export const bundle = {
  install (registry) {
    registry.register(POSISTestBaseProcess.ImageName, POSISTestBaseProcess)
  }
}
