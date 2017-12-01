export default class BaseProcess {
  constructor (context) {
    this.context = context
    this.kernel = this.context.queryPosisInterface('baseKernel')
  }
  get log () {
    return this.context.log
  }
  exit () {
    this.kernel.killProcess(this.id)
  }
  run () {}
}
