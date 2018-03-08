import each from 'lodash-es/each'
// import C from '../include/constants'

export default class Nest {
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

  get children () {
    this.memory.children = this.memory.children || {}
    return this.memory.children
  }

  get roomName () {
    return this.memory.room
  }

  get room () {
    return Game.rooms[this.roomName]
  }

  run () {
    if (!this.room || !this.room.controller || !this.room.controller.my) {
      this.log.warn(`Invalid nest, terminating. (${this.roomName},${JSON.stringify(this.memory)})`)
      this.kernel.killProcess(this.context.id)
    }
    let children = [['harvestManager', { room: this.roomName }]]

    each(children, ([child, context = {}]) => {
      let pid = this.children[child]
      if (!pid || !this.kernel.getProcessById(pid)) {
        let { pid, process} = this.kernel.startProcess(child, context)
        this.children[child] = pid
      }
    })
  }
}
