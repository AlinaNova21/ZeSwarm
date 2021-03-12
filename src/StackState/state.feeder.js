import C from '/constants'
// import log from '/log'

export default {
  feeder (cache = {}) {
    if (!this.creep.store.getCapacity()) {
      this.creep.say('No CARRY', true)
      this.push('suicide')
      return this.runStack()
    }
    const room = Game.rooms[this.creep.memory.room]
    if (this.creep.carry[C.RESOURCE_ENERGY]) {
      const [upCont] = room.controller.pos.findInRange(C.FIND_STRUCTURES, 3, { filter: { structureType: C.STRUCTURE_CONTAINER } })
      const targets = [...room.spawns, ...room.extensions, ...room.towers].filter(o => o.store.getFreeCapacity(C.RESOURCE_ENERGY))
      if (!targets.length && upCont && upCont.store.getFreeCapacity()) {
        this.log.info(`No targets, using upgrade cont`)
        this.creep.say('upg')
        targets.push(upCont)
      }
      if (!targets.length) {
        // this.push('sleep', 5)
        // return this.runStack()
        return
      }
      const target = this.creep.pos.findClosestByRange(targets)
      this.push('transfer', target.id, C.RESOURCE_ENERGY)
      this.push('moveNear', target.id)
    } else {
      const spawn = room.spawns[0]
      const term = room.terminal
      if (term && term.store.energy > 10000) {
        this.push('withdraw', term.id, C.RESOURCE_ENERGY)
        this.push('moveNear', term.id)
        return
      }
      const cont = room.storage && room.storage.store.energy ? room.storage : spawn.pos.findClosestByRange(room.containers)
      if (!cont) return this.creep.say('No Cont')
      if (cont.store.energy) {
        this.push('withdraw', cont.id, C.RESOURCE_ENERGY)
        if (!this.creep.pos.isNearTo(cont)) {
          this.push('moveNear', cont.id)  
        }
      } else {
        this.push('flee', [{ pos: cont.pos, range: 3 }])
      }      
    }
    return this.runStack()
  }
}
