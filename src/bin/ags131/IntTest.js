import C from '/include/constants'

export default class IntTest {
  constructor (context) {
    this.context = context
    this.kernel = context.queryPosisInterface('baseKernel')
    this.mm = context.queryPosisInterface('memoryManager')
  }

  get log () {
    return this.context.log
  }

  run () {
    this.kernel.setInterrupt(C.INT_TYPE.TICK, C.INT_STAGE.START)
    this.kernel.setInterrupt(C.INT_TYPE.TICK, C.INT_STAGE.END)
    this.kernel.setInterrupt(C.INT_TYPE.VISION, C.INT_STAGE.START)
    this.kernel.setInterrupt(C.INT_TYPE.SEGMENT, C.INT_STAGE.START)
    this.kernel.setInterrupt(C.INT_TYPE.CREEP, C.INT_STAGE.START)
    if (this.mm.load(10) === false) {
      this.mm.activate(10)
      this.kernel.clearAllInterrupts()
      this.kernel.wait(C.INT_TYPE.SEGMENT, C.INT_STAGE.START, 10)
    }
  }

  interrupt ({ hook: { type, stage }, key }) {
    this.log.info(`INT ${type} ${stage} ${key}`)
  }

  wake () {
    this.log.info('I Have awoken!')
  }
}
