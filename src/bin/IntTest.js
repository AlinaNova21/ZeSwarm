export default class IntTest {
  constructor (context) {
    this.context = context
    this.kernel = context.queryPosisInterface('baseKernel')
  }

  get log () {
    return this.context.log
  }

  run () {
    this.kernel.setInterrupt('tick', 'start')
    this.kernel.setInterrupt('tick', 'end')
    this.kernel.setInterrupt('vision', 'start')
    this.kernel.setInterrupt('segment', 'start')
    this.kernel.setInterrupt('creep', 'start')
    if (this.kernel.mm.load(10) === false) {
      this.kernel.clearAllInterrupts()
      this.kernel.wait('segment', 'start', 10)
    }
  }

  interrupt ({ hook: { type, stage }, key }) {
    this.log.info(`INT ${type} ${stage} ${key}`)
  }

  wake () {
    this.log.info('I Have awoken!')
  }
}
