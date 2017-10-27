class CronTest {
  constructor (context) {
    this.context = context
  }
  run () {
    let kernel = this.context.queryPosisInterface('baseKernel')
    kernel.clearAllInterrupts()
    let cron = this.context.queryPosisInterface('cron')
    cron.addCron('crontest', 5, 'ags131/CronTestJob', {})
    let sleeper = this.context.queryPosisInterface('sleep')
    sleeper.sleep(15)
  }
}

class CronTestJob {
  constructor (context) {
    this.context = context
    this.kernel = this.context.queryPosisInterface('baseKernel')
  }
  get id () {
    return this.context.id
  }
  run () {
    this.context.log.info(`Cron Test Tick!`)
    this.kernel.killProcess(this.id)
  }
}

export const bundle = {
  install (registry) {
    registry.register('ags131/CronTest', CronTest)
    registry.register('ags131/CronTestJob', CronTestJob)
  }
}
