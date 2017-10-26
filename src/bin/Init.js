import { each } from 'lodash-es'

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
    this.addService('legacy', 'legacy', {}, true)
    this.addService('intTest', 'intTest', {}, true)
    // this.addService('spawnManager','ags131/SpawnManager',{},true)
    // this.addService('sleeperTest','ags131/SleeperTest',{},true)
    // each(Game.rooms,room=>{
    //   this.addService('spawnTest','ags131/SpawnTest',{ room },true)
    //   if (room.controller && room.controller.my) {
    //     this.addService('upgrader','ags131/Upgrader',{ room: room.name },true)
    //   }
    // })
    // this.addService('baseTest','POSISTest/PosisBaseTestProcess',{ maxRunTime: 5 })
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

  addService (id, name, context = {}, restart = false) {
    if (this.services[id]) return
    this.log.warn(`Adding service ${id}`)
    this.services[id] = {
      name,
      context,
      restart,
      status: 'started'
    }
  }

  manageServices () {
    each(this.services, (service, id) => {
      let proc
      if (service.pid) proc = this.kernel.getProcessById(service.pid)
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
