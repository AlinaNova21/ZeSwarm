// import config from '@/etc/stats'
// import C from '@/constants'
import { Logger } from '@/log'
/* USAGE:
Configure CONFIG below
At VERY top of main.js:
> const stats = require('stats')

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
const config = {
  output: [
    {
      driver: 'Prometheus',
      types: ['segment'],
      segment: 98
    },
    {
      driver: 'Graphite', // Graphite, InfluxDB
      format: 'plain',
      segment: 99, 
      types: ['memory', 'segment'],
      key: '__stats',
    }
  ],
  format: 'plain', // Or JSON, only applies to Graphite driver
  types: ['memory', 'segment', 'console'], // memory, segment, console (the agent limits memory and segment to 15 second poll intervals)
  key: '__stats',
  segment: 99,
  baseStats: true,
  measureMemoryParse: false,
  usermap: { // use module.user in console to get userID for mapping. Defaults to username of Spawn1 if not defined
    // '577bc02e47c3ef7031adb268': 'ags131',
  }
}

const DRIVER_DEF = {
  driver: 'Graphite',
  types: ['memory'], // memory, segment, console
  key: '__stats'
}

const CONFIG = {
  driver: 'Graphite',
  types: ['memory'], // memory, segment, console
  key: '__stats',
  ticksToKeep: 20,
  segmentBase: 30,
  baseStats: true,
  measureMemoryParse: true,
  divider: ';', // "\n",
  usermap: { // use module.user in console to get userID for mapping.
    // '577bc02e47c3ef7031adb268': 'ags131',
  }
}

type StatTags = {
  [key: string]: string
}

type StatValues = {
  [key: string]: number
}

type StatEntry = {
  name: string
  tags: StatTags
  values: StatValues
}

export class Stats {
  public opts: any
  public log: Logger = new Logger('[stats]')
  public readonly startTick = Game.time
  public readonly shard = (Game.shard && Game.shard.name) || 'unknown'
  public readonly user = 'ags131' //C.USER
  public stats: StatEntry[] = []

  private _cpuAtReset: number

  get mem () {
    Memory[this.opts.key] = Memory[this.opts.key] || { index: 0, last: 0 }
    return Memory[this.opts.key]
  }

  constructor (opts = {}) {
    this.opts = Object.assign(CONFIG, opts)
    this.reset()
    /* @ts-ignore */
    require.initGlobals = require.initGlobals || {}
    /* @ts-ignore */
    require.initGlobals.main = () => this.reset()
  }

  reset () {
    if (Game.time === this.startTick) return // Don't reset on new tick
    this._cpuAtReset = Game.cpu.getUsed()
    this.stats = []
  }

  addSimpleStat (name: string, value: number = 0) {
    this.addStat(name, {}, { value })
  }

  addStat (name: string, tags: StatTags = {}, values: StatValues = {}) {
    this.stats.push({ name, tags, values })
  }

  addBaseStats () {
    this.addStat('time', {}, {
      tick: Game.time,
      timestamp: Date.now(),
      // duration: Memory.lastDur,
      globalUptime: Game.time - this.startTick
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
    const rooms = Object.values(Game.rooms)
    rooms.forEach(room => {
      const { controller, storage, terminal } = room
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
        }, storage.store as any)
      }
      if (terminal) {
        this.addStat('terminal', {
          room: room.name
        }, terminal.store as any)
      }
      const start = Game.cpu.getUsed()
      const events = room.getEventLog()
      const end = Game.cpu.getUsed()
      const eventStats = {
        stats: {
          count: events.length,
          parseTime: end - start
        },
        attack: {
          all: 0,
          melee: 0,
          ranged: 0,
          rangedMass: 0,
          dismantle: 0,
          hitBack: 0,
          nuke: 0
        },
        build: {
          amount: 0,
          energySpent: 0
        },
        harvest: {
          amount: 0
        },
        heal: {
          all: 0,
          melee: 0,
          ranged: 0
        },
        repair: {
          amount: 0,
          energySpent: 0
        },
        reserveController: {
          amount: 0
        },
        upgradeController: {
          amount: 0,
          energySpent: 0
        }
      }
      const etm = ['melee', 'ranged', 'rangedMass', 'dismantle', 'hitBack', 'nuke' ]
      for (const e of events) {
        switch (e.event) {
          case EVENT_ATTACK:
            eventStats.attack.all += e.data.damage
            eventStats.attack[etm[e.data.attackType - 1]] += e.data.damage
            break
          case EVENT_BUILD:
            eventStats.build.amount += e.data.amount
            eventStats.build.energySpent += e.data.energySpent
            break
          case EVENT_HARVEST:
            eventStats.harvest.amount += e.data.amount
            break
          case EVENT_HEAL:
            eventStats.heal.all += e.data.amount
            eventStats.heal[etm[e.data.healType - 1]] += e.data.amount
            break
          case EVENT_REPAIR:
            eventStats.repair.amount += e.data.amount
            eventStats.repair.energySpent += e.data.energySpent
            break
          case EVENT_RESERVE_CONTROLLER:
            eventStats.reserveController.amount += e.data.amount
            break
          case EVENT_UPGRADE_CONTROLLER:
            eventStats.upgradeController.amount += e.data.amount
            eventStats.upgradeController.energySpent += e.data.energySpent
            break
        }
      }      
      for (const [name, values] of Object.entries(eventStats)) {
        this.addStat(`events.${name}`, {
          room: room.name
        }, values)
      }
    })
    if (typeof Game.cpu.getHeapStatistics === 'function') {
      this.addStat('cpu.heapStatistics', {}, Game.cpu.getHeapStatistics() as any)
    }
    const used = Game.cpu.getUsed()
    this.addStat('cpu', {}, {
      bucket: Game.cpu.bucket,
      used: used,
      getUsed: used,
      limit: Game.cpu.limit,
      start: this._cpuAtReset,
      percent: (used / Game.cpu.limit) * 100
    })
  }

  commit (opts?: any) {
    if (!opts) {
      if (this.opts.baseStats) this.addBaseStats()
      if (this.opts.output) {
        for (const conf of this.opts.output) {
          this.commit(Object.assign({}, DRIVER_DEF, conf))
        }
        return
      }
      return this.commit(this.opts)
    }
    // console.log(opts.driver)
    const start = Game.cpu.getUsed()
    let stats = `text/${opts.driver.toLowerCase()}\n`
    stats += `${Game.time}\n`
    stats += `${Date.now()}\n`
    const format = this[`format${opts.driver}`].bind(this)
    this.stats.forEach(v => {
      stats += format(v)
    })
    const end = Game.cpu.getUsed()
    stats += format({ name: 'stats', tags: {}, values: { count: this.stats.length, size: stats.length, cpu: end - start } })
    if (opts.types.includes('segment')) {
      if (stats.length < 100 * 1024) {
        RawMemory.segments[opts.segment] = stats
      }
    }
    if (opts.types.includes('memory')) {
      Memory[opts.key] = stats
    }
    if (opts.types.includes('console')) {
      console.log('STATS;' + stats.replace(/\n/g, ';'))
    }
  }

  formatInfluxDB (stat: StatEntry) {
    const { name, tags, values } = stat
    const ltags = Object.assign({}, tags, { user: this.user, shard: this.shard })
    return `${name},${this.kv(ltags)} ${this.kv(values)}\n`
  }
  
  formatPrometheus(stat: StatEntry) {
    const { name, tags, values } = stat
    const ltags = Object.assign({}, tags, { user: this.user, shard: this.shard })
    const ts = Date.now()
    return Object.entries(values)
      .map(([k, v]) => [`${name}_${k}`.replace(/\./g, '_').replace(/([a-z])([A-Z])/g, (_, a, b) => `${a}_${b}`).toLowerCase(), v])
      .filter(([,v]) => typeof v === 'number' && !isNaN(v))
      .map(([k,v]) => `${k}{${this.kvQuoted(ltags).join(',')}} ${v} ${ts}\n`)
      .join('')
  }

  formatGraphite(stat: StatEntry) {
    const { name, tags, values } = stat
    const prefix = `${this.shard}` // .${this.shard}`
    const pre = [prefix, this.kv(tags, '.').join('.'), name].filter(v => v).join('.')
    return this.kv(values, ' ').map(v => `${pre}.${v}\n`).join('')
  }

  kv(obj: StatTags | StatValues, sep = '=') {
    return Object.entries(obj).map(([k, v]) => `${k}${sep}${v}`)
  }
  
  kvQuoted(obj: StatTags | StatValues, sep = '=') {
    return Object.entries(obj).map(([k, v]) => `${k}${sep}"${v}"`)
  }
}

const defaultInstance = new Stats(config)
export default defaultInstance
