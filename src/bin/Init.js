import each from 'lodash-es/each'
import config from '/etc/init'
// interface IInitMemory {
//   posisTestId?: PosisPID,
//   sleepTestId?: PosisPID,
//   msg?: string,
//   services: { [id: string]: ServiceDefinition }
// }

// export interface ServiceDefinition {
//   restart: boolean
//   name: string
//   context: any
//   status: 'started' | 'stopped'
//   pid?: PosisPID
// }

export default class Init {
  constructor (context) {
    this.context = context
    this.kernel = context.queryPosisInterface('baseKernel')
    this.sleep = context.queryPosisInterface('sleep')
    each(config.services, ({ id, name, params, restart, enabled }) => {
      this.addService(id, name, params, restart, enabled)
    })
    // each(Game.rooms,room=>{
    //   this.addService('spawnTest','ags131/SpawnTest',{ room },true)
    //   if (room.controller && room.controller.my) {
    //     this.addService('upgrader','ags131/Upgrader',{ room: room.name },true)
    //   }
    // })
  }
  get id () {
    return this.context.id
  }
  get log () {
    return this.context.log
  }
  get memory () {
    return this.context.memory
  }
  get services () {
    this.memory.services = this.memory.services || {}
    return this.memory.services
  }

  run () {
    this.log.info(`TICK! ${Game.time}`)
    this.manageServices()
    this.sleep.sleep(10)
  }

  addService (id, name, context = {}, restart = false, enabled = true) {
    this.services[id] = this.services[id] || {}
    Object.assign(this.services[id], {
        name,
        context,
        restart,
        enabled
    })
  }

  manageServices () {
    each(this.services, (service, id) => {
      let proc
      this.log.info(`serv ${service.name}, ${service.status}, ${service.pid}, ${!!proc}`)
      if (service.pid) proc = this.kernel.getProcessById(service.pid)
      if (!service.enabled) {
        if (service.pid) {
          this.log.info(`Killing stopped process ${service.name} ${service.pid}`)
          this.kernel.killProcess(service.pid)
        }
        service.status = 'stopped'
      }
      if (service.enabled) {
        if (!proc) {
          service.status = 'stopped'
          if (service.restart || !service.pid) {
            let { pid } = this.kernel.startProcess(service.name, Object.assign({}, service.context))
            service.pid = pid
            service.status = 'started'
          }
        }
      } else {
        if (proc || service.status === 'started') {
          this.log.info(`Killing stopped process ${service.name} ${service.pid}`)
          this.kernel.killProcess(service.pid)
        }
      }
    })
  }
}
