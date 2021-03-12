import C from '/constants'

export default {
  worker (target, cache = {}) {
    if (!cache.work) {
      cache.work = this.creep.getActiveBodyparts(C.WORK)
    }
    if (!cache.homeRoom) {
      cache.homeRoom = this.creep.memory.homeRoom || this.creep.room.name
    }
    const room = this.creep.room
    const homeRoom = Game.rooms[cache.homeRoom]
    const hasAllWorkers = true // Memory.census.workers.filter(w => w.room.name === room.name).length >= 6
    if (!this.creep.carry.energy) {
      const [, , roomName] = this.creep.name.split('.')
      if (roomName && this.creep.pos.roomName !== roomName) {
        this.push('moveToRoom', new RoomPosition(25, 25, roomName))
        return this.runStack()
      }
      const [resource] = this.creep.pos.findInRange(FIND_DROPPED_RESOURCES, 4)
        .filter(r => r.resourceType === C.RESOURCE_ENERGY)
      if (resource) {
        this.push('pickup', resource.id)
        this.push('moveNear', resource.id)
        return this.runStack()
      }
      const remote = this.creep.memory.room !== this.creep.room.name
      const tombstone = this.creep.pos.findInRange(FIND_TOMBSTONES, 3).find(o => o.store[C.RESOURCE_ENERGY])
      if (tombstone) {
        this.push('withdraw', tombstone.id, C.RESOURCE_ENERGY)
        this.push('moveNear', tombstone.pos)
        return this.runStack()
      }

      if (room.controller.level > 1) {
        const spawn = room.spawns[0]
        const cont = room.storage && room.storage.store.energy ? room.storage : (spawn && spawn.pos.findInRange(room.containers, 4)[0])
        if (cont && cont.store.energy) {
          this.push('moveNear', cont.id)
          this.push('withdraw', cont.id, C.RESOURCE_ENERGY)
          return this.runStack()
        }
      }
      const creeps = this.creep.room.find(C.FIND_MY_CREEPS)
        .filter(c => c.memory.role === 'miningWorker' && c.carry.energy > 30)
      if (creeps.length) {
        const creep = this.creep.pos.findClosestByRange(creeps)
        this.push('moveNear', creep.pos)
        this.push('say', 'take miner')
        this.push('revTransfer', creep.id, C.RESOURCE_ENERGY)
        return this.runStack()
      }
      
      const srcs = this.creep.room.find(C.FIND_SOURCES)
      const sn = Math.floor(Math.random() * srcs.length)
      const src = srcs[sn]
      if (!src) return this.creep.suicide()
      if (hasAllWorkers && Math.random() < 0.5 && room.energyAvailable >= room.energyCapacity * 0.75) {
        this.push('builder')
      }
      const harvCnt = Math.ceil(this.creep.carryCapacity / (cache.work * C.HARVEST_POWER))
      this.push('repeat', harvCnt, 'harvest', src.id)
      this.push('moveNear', src.id)
      return this.runStack()
    } else {
      if (room.name !== homeRoom.name) {
        this.push('moveToRoom', new RoomPosition(25, 25, homeRoom.name))
        return this.runStack()
      }
      // room.spawns[0].pos.findClosestByRange(room.containers)
      const { controller, storage } = room
      const controllerCritical = controller.level === 1 || controller.ticksToDowngrade < 5000
      const storageLow = !controllerCritical && storage && (storage.store.energy || 0) < (storage.storeCapacity * 0.2)
      const storageCritical = storageLow && (storage.store.energy || 0) < (storage.storeCapacity * 0.1)

      const s = [
        ...(homeRoom.towers || []),
        ...(homeRoom.spawns || [])
      ].filter(s => s.energy < s.energyCapacity)
      const feeder = room.spawns.length && room.spawns[0].pos.findInRange(C.FIND_MY_CREEPS, 7, { filter: c => c.memory.role === 'feeder' }).find(Boolean)
      if ((!feeder || storageCritical || !storage) && homeRoom.extensions) {
        s.push(...homeRoom.extensions.filter(s => s.energy < s.energyCapacity))
      }
      if (storageCritical) {
        // s.push(storage)
      }
      const RCL_LIMIT = 8
      let upgradeMode = false
      if (controller) {
        const csites = this.creep.room.find(C.FIND_MY_CONSTRUCTION_SITES) || []
        upgradeMode |= controllerCritical
        upgradeMode |= controller.level < RCL_LIMIT && hasAllWorkers && !s.length && (!csites.length || controller.level === 1) && !storageLow
        upgradeMode &= !s.filter(s => s.structureType === C.STRUCTURE_TOWER).length
      }
      if (upgradeMode) {
        const upCnt = Math.ceil(this.creep.carry.energy / cache.work)
        this.push('repeat', upCnt, 'upgradeController', controller.id)
        this.push('moveInRange', controller.id, 3)
        return this.runStack()
      }
      if (s.length) {
        const towers = s.filter(s => s.structureType === C.STRUCTURE_TOWER)
        const closest = this.creep.pos.findClosestByRange(towers.length ? towers : s)
        const vis = this.creep.room.visual
        vis.line(this.creep.pos, closest.pos, { stroke: 'red' })
        this.push('transfer', closest.id, C.RESOURCE_ENERGY)
        this.push('moveNear', closest.id)
        return this.runStack()
      } else {
        this.creep.say('notgt')
        this.push('builder')
        // this.push('flee', { pos: s.pos, range: 3 })
        return this.runStack()
      }
    }
  }
}
