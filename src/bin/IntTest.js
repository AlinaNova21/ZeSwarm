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
  }

  interrupt ({ hook: { type, stage }, key }) {
    this.log.info(`INT ${type} ${stage} ${key}`)
  }
}
