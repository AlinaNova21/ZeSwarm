import C from '/constants'
import { moveNear, withdraw, pickup, moveToRoom, upgradeController, moveInRange } from './actions'


export function * upgrader (creep) {
  const workParts = creep.getActiveBodyparts(C.WORK)
  const homeRoomName = creep.memory.homeRoom || creep.room.name
  while (true) {
    const room = creep.room
    const controller = room.controller.safe()
    const homeRoom = Game.rooms[homeRoomName]
    if (!creep.carry.energy) {
      const cont = room.storage && room.storage.store.energy ? room.storage : room.controller.pos.findClosestByRange(room.containers)
      if (cont && cont.store.energy) {
        const safeCont = cont.safe()
        yield* moveNear(creep, safeCont)
        yield* withdraw(creep, safeCont, C.RESOURCE_ENERGY)
      } else {
        creep.say('No Cont')
        const resource = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
          filter: {
            resourceType: C.RESOURCE_ENERGY
          }
        })
        if (resource) {
          const safeResource = resource.safe()
          yield * moveNear(creep, safeResource)
          yield * pickup(creep, safeResource)
        }
      }
    } else {
      if (room.name !== homeRoom.name) {
        yield * moveToRoom(creep, new RoomPosition(25, 25, homeRoom.name))
      }
      const upCnt = Math.ceil(creep.carry.energy / workParts)
      yield * moveInRange(creep, controller, 3)
      for (let i = 0; i < upCnt; i++) {
        yield * upgradeController(creep, controller)
      }
    }
    yield 
  }
}
