class SleeperTest {
  constructor (context) {
    this.context = context
  }
  run () {
    this.context.log.info(`Last ran ${Game.time - this.context.memory.lastRun} ticks ago`)
    this.context.log.info(`Sleeping for 5 ticks (${Game.time})`)
    let kernel = this.context.queryPosisInterface('baseKernel')
    kernel.clearAllInterrupts()
    let sleeper = this.context.queryPosisInterface('sleep')
    sleeper.sleep(5)
    this.context.memory.lastRun = Game.time
  }
}

export const bundle = {
  install (registry) {
    registry.register('ags131/SleeperTest', SleeperTest)
  }
}
