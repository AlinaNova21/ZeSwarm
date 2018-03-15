// Original idea taken from https://github.com/screepers/screeps-typescript-starter/blob/master/src/utils/ErrorMapper.ts
import { SourceMapConsumer } from 'source-map/lib/source-map-consumer'
import stackTrace from 'stack-trace'

export default class ErrorMapper {
  static get consumer () {
    if (!this._consumer) {
      this._consumer = new SourceMapConsumer(require(`${module.name}.js.map`))
    }
    return this._consumer
  }
  static map (error) {
    this.cache = this.cache || {}
    if (this.cache.hasOwnProperty(error.stack)) {
      return this.cache[error.stack]
    }
    let trace = stackTrace.parse(error)
    let ret = trace.map(cs => {
      let name = cs.getFunctionName()
      let source = cs.getFileName()
      let line = cs.getLineNumber()
      let column = cs.getColumnNumber()
      let pos = this.consumer.originalPositionFor({ line, column })
      line = pos.line || line
      column = pos.column || column
      name = pos.name || name
      source = pos.source || source || ''
      let trace = `${source}:${line}:${column}`
      if (name) {
        trace = `${name} (${trace})`
      }
      return `    at ${trace}`
    }).join('\n')
    ret = `Error: ${error.message}\n${ret}`
    this.cache[error.stack] = ret
    return ret
  }
}
