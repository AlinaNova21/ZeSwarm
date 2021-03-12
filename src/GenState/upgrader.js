import C from '/constants'
import { moveNear, withdraw, pickup, moveToRoom, upgradeController, moveInRange, build } from './actions'


export function * upgrader (creep) {
  const workParts = creep.getActiveBodyparts(C.WORK)
  const homeRoomName = creep.memory.homeRoom || creep.room.name
  while (true) {
    const room = creep.room
    const controller = room.controller.safe()
    const homeRoom = Game.rooms[homeRoomName]
    if (!creep.carry.energy) {
      const tgts = [room.storage, ...room.containers].filter(Boolean)
      const cont = room.controller.pos.findClosestByRange(tgts, { filter: c => c.store.energy })
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
      const [cont] = room.controller.pos.findInRange(C.FIND_STRUCTURES, 3, { filter: { structureType: C.STRUCTURE_CONTAINER } })
      const safeCont = cont && cont.safe()
      const upCnt = Math.ceil(creep.carry.energy / workParts)
      yield * moveInRange(creep, controller, 3)
      const [upSite] = room.controller.pos.findInRange(C.FIND_MY_CONSTRUCTION_SITES, 3, { filter: { structureType: C.STRUCTURE_CONTAINER } })
      const safeSite = upSite && upSite.safe()
      for (let i = 0; i < upCnt; i++) {
        if (safeSite && safeSite.valid) {
          yield * build(creep, safeSite)
        } else {
          if (creep.store.energy < workParts * 2 && safeCont && safeCont.valid && safeCont.store.energy && creep.pos.isNearTo(safeCont)) {
            creep.withdraw(safeCont, C.RESOURCE_ENERGY)
          }
          yield * upgradeController(creep, controller)  
        }
      }
    }
    yield 
  }
}
