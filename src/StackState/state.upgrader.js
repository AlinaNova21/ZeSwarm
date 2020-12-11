import C from '/constants'

export default {
  upgrader(cache = {}) {
    if (!cache.work) {
      cache.work = this.creep.getActiveBodyparts(C.WORK)
    }
    if (!cache.homeRoom) {
      cache.homeRoom = this.creep.memory.homeRoom || this.creep.room.name
    }
    const room = this.creep.room
    const homeRoom = Game.rooms[cache.homeRoom]
    if (!this.creep.carry.energy) {
      const cont = room.storage && room.storage.store.energy ? room.storage : room.controller.pos.findClosestByRange(room.containers)
      if (cont && cont.store.energy) {
        this.push('moveNear', cont.id)
        this.push('withdraw', cont.id, C.RESOURCE_ENERGY)
      } else {
        this.creep.say('No Cont')
        const resource = this.creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
          filter: {
            resourceType: C.RESOURCE_ENERGY
          }
        })
        if (resource) {
          this.push('pickup', resource.id)
          this.push('moveNear', resource.id)
          return this.runStack()
        }
        return
      }
      return this.runStack()
    } else {
      if (room.name !== homeRoom.name) {
        this.push('moveToRoom', new RoomPosition(25, 25, homeRoom.name))
        return this.runStack()
      }
      const upCnt = Math.ceil(this.creep.carry.energy / cache.work)
      this.push('repeat', upCnt, 'upgradeController', room.controller.id)
      this.push('moveInRange', room.controller.id, 3)
      return this.runStack()
    }
  }
}
