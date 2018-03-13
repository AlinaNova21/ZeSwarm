import etc from '../etc'

/* USAGE:
Configure CONFIG below
At VERY top of main.js:
> const stats = require('stats')

At top of loop():
> stats.reset()

At bottom of loop():
> stats.commit()

to add a stat, just call
> stats.addSimpleStat(key,value)
or more advanced
> stats.addStat('scheduler',{ queue: 1 },{ count: 5, max: 5, min: 2, amount: 3 })

Tags (second argument) should not contain data that varies a lot, for example, don't
put stuff like object ids in tags doing so ends up causing massive performance hits
as the tag indexes get too large too quickly. Good data for tags is more static stuff
such as roomName, sectorName, etc, low overall spread.

*/
const CONFIG = {
  driver: 'Graphite',
  types: ['memory'], // memory, segment, console
  key: '__stats',
  ticksToKeep: 20,
  segmentBase: 30,
  baseStats: true,
  measureMemoryParse: true,
  divider: ';',  // "\n",
  usermap: { // use module.user in console to get userID for mapping.
    // '577bc02e47c3ef7031adb268': 'ags131',
  }
}

export class InfluxDB {
  get mem () {
    Memory[this.opts.key] = Memory[this.opts.key] || { index: 0, last: 0 }
    return Memory[this.opts.key]
  }
  constructor (opts = {}) {
    this.opts = Object.assign(CONFIG, opts)
    global.influxdb = this
    this.reset()
    this.startTick = Game.time
    this.shard = (Game.shard && Game.shard.name) || 'shard0'
    this.user = _.find(Game.spawns, v => v).owner.username
  reset () {
    if (Game.time === this.startTick) return // Don't reset on new tick
    this.stats = []
    this.cpuReset = Game.cpu.getUsed()

    if (!this.opts.measureMemoryParse) return
    let start = Game.cpu.getUsed()
    if (this.lastTime && global.LastMemory && Game.time === (this.lastTime + 1)) {
      delete global.Memory
      global.Memory = global.LastMemory
      RawMemory._parsed = global.LastMemory
      console.log('[1] Tick has same GID!')
    } else {
      Memory // eslint-disable-line no-unused-expressions
      global.LastMemory = RawMemory._parsed
    }
    this.lastTime = Game.time
    let end = Game.cpu.getUsed()
    let el = end - start
    this.memoryParseTime = el
    this.addStat('memory', {}, {
      parse: el,
      size: RawMemory.get().length
    })
    this.endReset = Game.cpu.getUsed()
    console.log(`[1] [Stats] Entry: ${this.cpuReset.toFixed(3)} - Exit: ${(this.endReset - this.cpuReset).toFixed(3)} - Mem: ${this.memoryParseTime.toFixed(3)} (${(RawMemory.get().length / 1024).toFixed(2)}kb)`)
  }
  addSimpleStat (name, value = 0) {
    this.addStat(name, {}, { value })
  }
  addStat (name, tags = {}, values = {}) {
    this.stats.push({ name, tags, values })
  }
  addBaseStats () {
    this.addStat('time', {}, {
      tick: Game.time,
      timestamp: Date.now(),
      duration: Memory.lastDur
    })
    this.addStat('gcl', {}, {
      level: Game.gcl.level,
      progress: Game.gcl.progress,
      progressTotal: Game.gcl.progressTotal,
      progressPercent: (Game.gcl.progress / Game.gcl.progressTotal) * 100
    })
    this.addStat('market', {}, {
      credits: Game.market.credits
    })
    _.each(Game.rooms, room => {
      let { controller, storage, terminal } = room
      if (!controller || !controller.my) return
      this.addStat('room', {
        room: room.name
      }, {
        level: controller.level,
        progress: controller.progress,
        progressTotal: controller.progressTotal,
        progressPercent: (controller.progress / controller.progressTotal) * 100,
        energyAvailable: room.energyAvailable,
        energyCapacityAvailable: room.energyCapacityAvailable
      })
      if (controller) {
        this.addStat('controller', {
          room: room.name
        }, {
          level: controller.level,
          progress: controller.progress,
          progressTotal: controller.progressTotal,
          progressPercent: (controller.progress / controller.progressTotal) * 100
        })
      }
      if (storage) {
        this.addStat('storage', {
          room: room.name
        }, storage.store)
      }
      if (terminal) {
        this.addStat('terminal', {
          room: room.name
        }, terminal.store)
      }
    })
    if (typeof Game.cpu.getHeapStatistics === 'function') {
      this.addStat('heap', {}, Game.cpu.getHeapStatistics())
    }
    let used = Game.cpu.getUsed()
    this.addStat('cpu', {}, {
      bucket: Game.cpu.bucket,
      used: used,
      limit: Game.cpu.limit,
      start: this.cpuReset,
      percent: (used / Game.cpu.limit) * 100
    })
  }
  commit () {
    let start = Game.cpu.getUsed()
    if (this.opts.baseStats) this.addBaseStats()
    let stats = `text/${this.opts.driver.toLowerCase()}\n`
    stats += `${Game.time}\n`
    stats += `${Date.now()}\n`
    let format = this[`format${this.opts.driver}`].bind(this)
    _.each(this.stats, (v, k) => {
      stats += format(v)
    })
    let end = Game.cpu.getUsed()
    stats += format({ name: 'stats', tags: {}, values: { count: this.stats.length, size: stats.length, cpu: end - start } })
    if (this.opts.types.includes('segment')) {
      RawMemory.segments[this.opts.segment] = stats
    }
    if (this.opts.types.includes('memory')) {
      Memory[this.opts.key] = stats
    }
    if (this.opts.types.includes('console')) {
      console.log('STATS;' + stats.replace(/\n/g, ';'))
    }
  }
  formatInfluxDB (stat) {
    let { name, tags, values } = stat
    Object.assign(tags, { user: this.user, shard: this.shard })
    return `${name},${this.kv(tags)} ${this.kv(values)}\n`
  }
  formatGraphite (stat) {
    let { name, tags, values } = stat
    if (!this.prefix) {
      this.prefix = `${this.user}` // .${this.shard}`
    }
    let pre = [this.prefix, this.kv(tags, '.').join('.'), name].filter(v => v).join('.')
    return this.kv(values, ' ').map(v => `${pre}.${v}\n`).join('')
  }
  kv (obj, sep = '=') {
    return _.map(obj, (v, k) => `${k}${sep}${v}`)
  }
}

const driver = new InfluxDB(etc.stats)
export default driver
