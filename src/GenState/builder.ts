import { sleep } from '@/kernel'
import * as R from 'ramda'
import { build, move, moveInRange, moveNear, pickup, repair, withdraw } from './actions'

const fakeStruct = { hits: 1e100 } as Structure // Just so reduce works right
const minHP = R.reduce<Structure,Structure>(R.minBy(R.prop('hits')), fakeStruct)
/**
 * @param {Creep} creep
 */
export function * builder(creep: Creep) {
  const parts = R.memoizeWith(R.identity, (type: BodyPartConstant) => creep.getActiveBodyparts(type))
  const workParts = parts(WORK)
  while (true) {
    if (creep.store[RESOURCE_ENERGY]) {
      const sites = creep.room.find(FIND_CONSTRUCTION_SITES).map(s => s.safe<ConstructionSite>())
      if (sites.length) {
        const priority = {
          [STRUCTURE_EXTENSION]: 12,
          [STRUCTURE_TOWER]: 13,
          [STRUCTURE_SPAWN]: 15,
          [STRUCTURE_OBSERVER]: 5
        }
        if (!creep.room.containers.length) {
          priority[STRUCTURE_CONTAINER] = 100
        }
        const [site] = sites.reduce(([tgt, v1]: [ConstructionSite, number], site) => {
          const v2 = ((priority[site.structureType] || 1) * 10000) + ((site.progress / site.progressTotal) * 100)
          return v1 < v2 ? [site, v2] : [tgt, v1]
        }, [null, -1])
        while (creep.pos.isEqualTo(site.pos)) {
          const dir = Math.ceil(Math.random() * 7) as DirectionConstant
          yield * move(creep, dir)
        }
        yield* moveInRange(creep, site, 3, { moveOffRoad: true })
        if (!site.valid) continue
        creep.say(`B ${site.pos.x},${site.pos.y}`)
        if (site.structureType === STRUCTURE_RAMPART) {
          const { x, y } = site.pos
          yield * build(creep, site)
          const rampart = creep.room.lookForAt(LOOK_STRUCTURES, x, y)
            .find(s => s.structureType === STRUCTURE_RAMPART).safe<StructureRampart>()
          while (creep.store[RESOURCE_ENERGY]) {
            yield * repair(creep, rampart)
          }
        } else {
          while (site.valid && creep.store[RESOURCE_ENERGY]) {
            yield* build(creep, site)
          }
        }
      }
      const damaged = creep.room.find(FIND_STRUCTURES, { filter: r => r.hits < r.hitsMax }).map(r => r.safe<Structure>())
      if (damaged.length) {
        let tgt = creep.pos.findClosestByRange(damaged)
        // const lowestRoad = minHP(roads.filter(r => r.hits < r.hitsMax))
        if (tgt && tgt.valid) {
          creep.say(`D ${tgt.pos.x},${tgt.pos.y}`)
          yield* moveInRange(creep, tgt, 3, { moveOffRoad: true })
          while (tgt.valid && tgt.hits < tgt.hitsMax && creep.store[RESOURCE_ENERGY]) {
            yield* repair(creep, tgt)
          }
          continue
        }
      }
      const ramparts = creep.room.find(FIND_STRUCTURES, { filter: r => r.structureType === STRUCTURE_RAMPART }).map(r => r.safe<StructureRampart>())
      const tgt = minHP(ramparts)
      if (tgt && tgt.valid) {
        creep.say(`R ${tgt.pos.x},${tgt.pos.y}`)
        yield* moveInRange(creep, tgt, 3, { moveOffRoad: true })
        while (tgt.valid && tgt.hits < tgt.hitsMax && creep.store[RESOURCE_ENERGY]) {
          yield* repair(creep, tgt)
        }
        continue
      }
      creep.say('🚫🎯')
    } else {
      while (creep.room.storage && creep.room.storage.store.getUsedCapacity(RESOURCE_ENERGY) < 10000 && creep.room.energyAvailable < creep.room.energyCapacityAvailable) {
        creep.say('🚫⚡ 💤')
        yield * sleep(5)
      }
      yield* fetchEnergy(creep)
      continue
    }
    yield
  }
}

function * fetchEnergy(creep: Creep) {
  const [res] = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 5).map(s => s.safe<Resource>())
  if (res) {
    yield * moveNear(creep, res)
    yield * pickup(creep, res)
    return
  }
  const [ts] = creep.pos.findInRange(FIND_TOMBSTONES, 5).map(s => s.safe<Tombstone>())
  if (ts) {
    yield* moveNear(creep, ts)
    yield* withdraw(creep, ts, RESOURCE_ENERGY)
    return
  }
  if (creep.room.storage && creep.room.storage.store.energy) {
    const stor = creep.room.storage.safe()
    yield* moveNear(creep, stor)
    yield* withdraw(creep, stor, RESOURCE_ENERGY)
    return
  }
  creep.say('NoEnergy')
  yield * sleep(3)
  yield * fetchEnergy(creep)
}

// /**
//  * @param Creep
//  * @return {Structure | ConstructionSite}
//  */
// function findTarget(creep: Creep): Structure | ConstructionSite {
  
// }