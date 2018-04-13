import C from '/include/constants'
import sum from 'lodash-es/sum'
import values from 'lodash-es/values'

export default {
  collector (target, resourceType = C.RESOURCE_ENERGY) {
    let tgt = this.resolveTarget(target)
    if (!this.creep.carryCapacity) {
      this.creep.say('No CARRY', true)
      this.push('suicide')
      return this.runStack()
    }
    if (sum(values(this.creep.carry)) === this.creep.carryCapacity) {
      this.push('store', resourceType)
      return this.runStack()
    }
    if (!this.creep.pos.inRangeTo(tgt, 3)) {
      this.log.info(`moveInRange`)
      this.push('moveInRange', target, 3)
      return this.runStack()
    }
    let { x, y } = tgt.pos
    // let [{ resource: res } = {}] = this.creep.room.lookForAtArea(C.LOOK_RESOURCES, y - 1, x - 1, y + 1, x + 1, true)
    let resources = this.creep.room.lookForAtArea(C.LOOK_RESOURCES, y - 1, x - 1, y + 1, x + 1, true)
      .filter(r => r.resourceType === resourceType)
    if (resources.length) {
      this.push('pickup', resources[0].resource.id)
      this.push('moveNear', resources[0].resource.id)
      return this.runStack()
    }
    let [{ structure: cont } = {}] = this.creep.room.lookForAtArea(C.LOOK_STRUCTURES, y - 1, x - 1, y + 1, x + 1, true)
      .filter(({ structure: s }) => s.structureType === C.STRUCTURE_CONTAINER && s.store[resourceType])
    if (cont) {
      if(cont.store[resourceType] < this.creep.carryCapacity) {
        this.push('sleep', 5)
      }
      this.push('withdraw', cont.id, resourceType)
      this.push('moveNear', cont.id)
      return this.runStack()
    }
  }
}
