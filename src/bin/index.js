import Init from './Init'
import IntTest from './IntTest'

export const bundle = {
  install (registry) {
    registry.register('init', Init)
    registry.register('intTest', IntTest)
  }
}
