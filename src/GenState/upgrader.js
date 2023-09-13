import { C } from '@/constants'
import { moveNear, withdraw, pickup, moveToRoom, upgradeController, moveInRange, build, transfer, sleep } from './actions'
import { getUpgradeContainer } from '../UpgradeManager'
import SafeObject from '@/lib/SafeObject'

/**
 * 
 * @param {Creep} creep 
 */
export function * upgrader (creep) {
  const workParts = creep.getActiveBodyparts(C.WORK)
  const homeRoomName = creep.memory.homeRoom || creep.room.name
  while (true) {
    const room = creep.room
    const controller = room.controller.safe()
    const homeRoom = Game.rooms[homeRoomName]
    if (!creep.store[C.RESOURCE_ENERGY]) {
      /** @type {SafeObject<StructureContainer>} */
      const cont = getUpgradeContainer(room.name)
      /** @type {SafeObject<StructureStorage>} */
      const stor = room.storage && room.storage.safe()      
      const tgt = cont && cont.valid && cont.store[C.RESOURCE_ENERGY] ? cont : stor
      if (tgt && tgt.store[C.RESOURCE_ENERGY]) {
        yield* moveNear(creep, tgt)
        yield* withdraw(creep, tgt, C.RESOURCE_ENERGY)
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
        yield * moveToRoom(creep, homeRoom.name)
      }
      const cont = getUpgradeContainer(room.name)
      if (!creep.pos.inRangeTo(controller, 3)) {
        yield * moveInRange(creep, controller, 3, {
          plainCost: 4,
          swampCost: 40,
          containerCost: 1
        })
      }
      const [upSite] = room.controller.pos.findInRange(C.FIND_MY_CONSTRUCTION_SITES, 3, { filter: { structureType: C.STRUCTURE_CONTAINER } })
      const safeSite = upSite && upSite.safe()
      while (creep.store[C.RESOURCE_ENERGY]) {
        if (safeSite && safeSite.valid) {
          yield * build(creep, safeSite)
        } else {
          const tgt = cont && cont.valid && cont.store[C.RESOURCE_ENERGY] && cont
          if (tgt && creep.store[C.RESOURCE_ENERGY] < workParts * 2 && creep.pos.isNearTo(cont)) {
            creep.withdraw(cont, C.RESOURCE_ENERGY)
          }
          yield * upgradeController(creep, controller)  
        }
      }
    }
    yield 
  }
}

/**
 * 
 * @param {Creep} creep 
 */
export function * upgradeHauler (creep) {
  while(true) {
    const cont = getUpgradeContainer(creep.room.name)
    if (!cont || !cont.valid) {
      creep.say('No Cont')
      yield
      continue
    }
    const freeCapacity = cont.store.getFreeCapacity(C.RESOURCE_ENERGY)
    if (creep.store[C.RESOURCE_ENERGY]) {
      if (freeCapacity) {
        yield* moveNear(creep, cont)
        yield* transfer(creep, cont, C.RESOURCE_ENERGY)
        if (creep.store[C.RESOURCE_ENERGY] && creep.ticksToLive > 50) {
          // Wait to give upgraders a chance to grab before falling back to storage drop
          yield* sleep(10)
        }
      } else {
        yield* moveNear(creep, creep.room.storage)
        yield* transfer(creep, creep.room.storage, C.RESOURCE_ENERGY)
      }
    } else if (freeCapacity) {
      yield* moveNear(creep, creep.room.storage)
      yield* withdraw(creep, creep.room.storage, C.RESOURCE_ENERGY)
    }
    yield
  }
}