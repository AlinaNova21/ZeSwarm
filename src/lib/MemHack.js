export default {
  newGlobal: true,
  register () {
    this.doHack()
  }
  pretick () {
    if (this.newGlobal) {
      this.newGlobal = false
      return // Skip hack on newGlobals since its already ran
    }
    this.doHack()
  }
  doHack () {
    let start = Game.cpu.getUsed()
    if (this.lastTime && this.memory && Game.time === (this.lastTime + 1)) {
      delete global.Memory
      global.Memory = this.memory
      RawMemory._parsed = this.memory
      console.log('[1] Tick has same GID!')
    } else {
      Memory // eslint-disable-line no-unused-expressions
      this.memory = RawMemory._parsed
    }
    this.lastTime = Game.time
    let end = Game.cpu.getUsed()
    this.parseTime = end - start
  }
}

/*
export default {
  register () {
    let start = Game.cpu.getUsed()
    Memory
    let end = Game.cpu.getUsed()
    this.parseTime = end - start
    this.memory = RawMemory._parsed
  }
  pretick () {
    delete global.Memory
    global.Memory = this.memory
  }
}
*/