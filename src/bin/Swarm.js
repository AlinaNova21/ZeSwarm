import C from '../include/constants'
import each from 'lodash-es/each'

export default class Swarm {
  constructor (context) {
    this.context = context
    this.kernel = context.queryPosisInterface('baseKernel')
    this.mm = context.queryPosisInterface('memoryManager')
  }

  get log () {
    return this.context.log
  }

  get memory () {
    return this.context.memory
  }

  get nests () {
    this.memory.nests = this.memory.nests || {}
    return this.memory.nests
  }

  run () {
    each(Game.rooms, (room, name) => {
      if (!room.controller || !room.controller.my) return
      if (!this.nests[name]) {
        this.nests[name] = {}
      }
    })
    each(this.nests, (nest, room) => {
      let proc = this.kernel.getProcessById(nest.pid)
      if (!Game.rooms[room] || !Game.rooms[room].controller || !Game.rooms[room].controller.my) {
        if (proc) {
          this.kernel.killProcess(nest.pid)
        }
        delete this.nests[room]
      }
      if (!proc) {
        this.log.info(`Nest not managed, beginning management of ${room}`)
        let { pid } = this.kernel.startProcess('nest', { room })
        nest.pid = pid
      }
    })
    this.kernel.sleep(5)
  }

  interrupt ({ hook: { type, stage }, key }) {
    this.log.info(`INT ${type} ${stage} ${key}`)
  }

  wake () {
    this.log.info('I Have awoken!')
  }
}
