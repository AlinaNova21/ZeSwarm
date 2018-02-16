import each from 'lodash-es/each'

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
    this.etc = context.queryPosisInterface('etc')
    each(this.etc.init.services, ({ id, name, params, restart, enabled }) => {
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
  }

  addService (id, name, context = {}, restart = false, enabled = true) {
    if (this.services[id]) {
      let serv = this.services[id]
      serv.restart = restart
      serv.name = name
      serv.context = context
      serv.enabled = enabled
    } else {
      this.log.warn(`Adding service ${id}`)
      this.services[id] = {
        name,
        context,
        restart,
        status: 'started',
        enabled
      }
    }
  }

  manageServices () {
    each(this.services, (service, id) => {
      let proc
      if (service.pid) proc = this.kernel.getProcessById(service.pid)
      if (!service.enabled) {
        service.status = 'stopped'
      }
      switch (service.status) {
        case 'started':
          if (!proc) {
            if (service.restart || !service.pid) {
              let { pid } = this.kernel.startProcess(service.name, Object.assign({}, service.context))
              service.pid = pid
            } else {
              service.status = 'stopped'
            }
          }
          break
        case 'stopped':
          if (proc && service && service.pid) {
            this.log.info(`Killing stopped process ${service.name} ${service.pid}`)
            this.kernel.killProcess(service.pid)
          }
          break
      }
    })
  }
}
