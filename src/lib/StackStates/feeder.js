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
      if (!tgt) {
        tgt = room.storage || room.structures[STRUCTURE_CONTAINER]
        if (tgt && pos.isNearTo(tgt)) {
          this.push('flee', [{ pos: tgt.pos, range: 2 }])
          return this.runStack()
        }
      }
    } else {
      let tgt
      if (room.storage && room.storage.store.energy > 50) {
        tgt = room.storage
      } else {
        let conts = (room.structures[STRUCTURE_CONTAINER] || []).filter(c => c.store.energy)
        if (conts.length) {
          let cont = pos.findClosestByRange(conts)
          tgt = cont
        }
      }
      if (tgt) {
        if (tgt.store.energy < 50) {
          let { x, y, roomName } = tgt.pos
          this.push('repeat',5,'flee', [{ pos: { x, y, roomName }, range: 5 }])
          return this.runStack()
        }
        this.push('withdraw', tgt.id, C.RESOURCE_ENERGY)
        this.push('moveNear', tgt.id)
        return this.runStack()
      } else {
        let list = room.containers
        if (room.storage) { 
          list.push(room.storage)
        }
        list = list.map(({ pos: { x, y, roomName }}) => ({ pos: { x, y, roomName }, range: 5 }))
        this.push('repeat', 5, 'flee', list)
        return this.runStack()
      }
    }
  }
}
