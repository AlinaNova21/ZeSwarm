import C from '/include/constants'
import filter from 'lodash-es/filter'

export default class ProcessTreeDump {
  constructor (context) {
    this.context = context
    this.kernel = context.queryPosisInterface('baseKernel')
  }

  get log () {
    return this.context.log
  }

  run () {
    let pt = this.kernel.processTable
    let tree = `Process Tree:`
    tree += this.getTree(pt, 'ROOT')
    this.log.info(tree)
  }

  getTree (pt, parent, prefix = '|') {
    let children = filter(pt, ({ p }) => p === parent)
    return children.map(p => {
      if (p.s !== C.PROC_RUNNING) return
      let desc 
      try {
        desc = this.kernel.getProcessById(p.i).toString()
      } catch (e) {
        desc = e.message || e.toString()
      }
      let ret = `\n${prefix}- ${p.i} ${p.n} ${desc}`
      ret += this.getTree(pt, p.i, `  ${prefix}`)
      return ret
    }).join('')
  }

  interrupt ({ hook: { type, stage }, key }) {
    this.log.info(`INT ${type} ${stage} ${key}`)
  }

  wake () {
    this.log.info('I Have awoken!')
  }
}
