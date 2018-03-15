import C from '/include/constants'
import sum from 'lodash-es/sum'
import values from 'lodash-es/values'

export default {
  collector (target) {
    let tgt = this.resolveTarget(target)
    if (sum(values(this.creep.carry)) === this.creep.carryCapacity) {
      this.push('store', C.RESOURCE_ENERGY)
      return this.runStack()
    }
    if (!this.creep.pos.inRangeTo(tgt, 2)) {
      this.log.info(`moveInRange`)
      this.push('moveInRange', target, 2)
      return this.runStack()
    }
    let { x, y } = tgt.pos
    let [{ resource: res } = {}] = this.creep.room.lookForAtArea(C.LOOK_RESOURCES, y - 1, x - 1, y + 1, x + 1, true)
    if (res) {
      this.push('pickup', res.id)
      return this.runStack()
    }
    let [{ structure: cont } = {}] = this.creep.room.lookForAtArea(C.LOOK_STRUCTURES, y - 1, x - 1, y + 1, x + 1, true)
      .filter(({ structure: s }) => s.structureType === C.STRUCTURE_CONTAINER && s.store.energy)
    if (cont) {
      this.push('withdraw', cont.id, C.RESOURCE_ENERGY)
      return this.runStack()
    }
  }
}
