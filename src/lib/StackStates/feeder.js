import sum from 'lodash-es/sum'
import values from 'lodash-es/values'

export default {
  feeder () {
    let { room, pos } = this.creep
    if (sum(values(this.creep.carry)) === this.creep.carryCapacity) {
      let tgt
      let types = [STRUCTURE_TOWER, STRUCTURE_EXTENSION, STRUCTURE_SPAWN]
      for (let i = 0; i < types.length; i++) {
        let tgts = (room.structures[types[i]] || []).filter(s => s.energy < s.energyCapacity)
        if (tgts.length) {
          tgt = pos.findClosestByRange(tgts).id
          break
        }
      }
      if (tgt) {
        this.push('transfer', tgt, C.RESOURCE_ENERGY)
        this.push('moveNear', tgt)
        return this.runStack()
      }
    } else {
      let tgt
      if (room.storage) {
        tgt = room.storage.id
      } else {
        let conts = (room.structures[STRUCTURE_CONTAINER] || []).filter(c => c.store.energy)
        if (!conts.length) return
        let cont = pos.findClosestByRange(conts)
        tgt = cont.id
      }
      if (tgt) {
        this.push('withdraw', tgt, C.RESOURCE_ENERGY)
        this.push('moveNear', tgt)
        return this.runStack()
      }
    }
  }
}
