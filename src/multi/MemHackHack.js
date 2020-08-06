import merge from 'lodash/merge'

export default {
  active: false,
  memory: {},
  preTick () {
    if (this.active) {
      delete global.Memory
      global.Memory = this.memory
      RawMemory._parsed = this.memory
    }
  },
  postTick () {
    if (this.memory === RawMemory._parsed) {
      this.active = true
    }
    this.memory = RawMemory._parsed
  }
}