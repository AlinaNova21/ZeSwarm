export default {
  offset: Math.floor(Math.random() * 10),
  get memory () {
    Memory.__globals = Memory.__globals || {}
    return Memory.__globals
  },
  get meta () {
    return (this.memory.meta && this.memory.meta[this.id]) || {}
  },
  register () {
    this.init()
  },
  pretick () {
    this.tick()
  },
  posttick () {
    if (Game.time % 10 === this.offset) {
      this.cleanup()
    }
  },
  init () {
    this.memory.nextID = this.memory.nextID || 1
    this.id = (this.memory.nextID++)
    this.memory.meta = this.memory.meta || {}
    this.memory.meta[this.id] = {
      id: this.id,
      init: Date.now(),
      firstTick: Game.time,
      dur: 0
    }
  },
  cleanup () {
    let keys = Object.keys(this.memory.meta)
    if (keys.length < 60) return
    keys.slice(0, -60).forEach(k => delete this.memory.meta[k])
  },
  tick () {
    let now = Date.now()
    this.meta.lastRun = now
    this.meta.lastTick = Game.time
    this.meta.dur = Game.time - this.meta.firstTick
    this.memory.lastID = this.id

    if (this.statDriver) {
      this.statDriver.addStat('global', {}, this.meta)
    }
  }
}
