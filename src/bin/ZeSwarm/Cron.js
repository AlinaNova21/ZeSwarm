import each from 'lodash-es/each'
import BaseProcess from './BaseProcess'

export default class Cron extends BaseProcess {
  constructor (context) {
    super(context)

    let extensionRegistry = this.context.queryPosisInterface('agsExtensionRegistry')
    extensionRegistry.register('cron', this)

    this.etc = context.queryPosisInterface('etc')
    each(this.etc.cron.crons, ([interval, name, params], ind) => {
      this.addCron(`etc_${ind}`, interval, name, params)
    })
  }

  get crons () {
    this.context.memory.crons = this.context.memory.crons || {}
    return this.context.memory.crons
  }

  run () {
    each(this.crons, cron => {
      if (Game.time % cron.interval === cron.offset) {
        try {
          this.kernel.startProcess(cron.name, cron.params)
          this.log.info(`Cron ran ${cron.id} ${cron.name}`)
        } catch (e) {
          this.log.error(`Cron failed to run ${cron.id} ${cron.name} ${e.stack || e}`)
        }
      }
    })
  }

  addCron (id, interval, name, params) {
    let cron = this.crons[id]
    if (cron) {
      Object.assign(cron, { interval, name, params })
    } else {
      this.crons[id] = {
        id,
        interval,
        name,
        params,
        offset: Math.floor(Math.random() * interval)
      }
    }
  }
}
