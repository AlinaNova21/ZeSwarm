const C = require('/constants')

module.exports = {
  defender (cache) {
    if (!cache) {
      this.pop()
      this.push('defender', {})
    }
    if (!cache.attack) {
      cache.attack = this.creep.getActiveBodyparts(C.ATTACK)
      cache.ranged = this.creep.getActiveBodyparts(C.RANGED_ATTACK)
      cache.heal = this.creep.getActiveBodyparts(C.HEAL)
    }
    const { room } = this.creep
    const hostiles = room.find(C.FIND_HOSTILE_CREEPS)
    const tgt = this.creep.pos.findClosestByRange(hostiles)
    if (!tgt) return
    room.visual.line(this.creep.pos, tgt.pos, { color: 'red' })
    this.creep.pull(tgt)
    this.creep.moveTo(tgt)
    if (cache.heal) {
      if (this.creep.hits < this.creep.hitsMax) {
        this.creep.heal(this.creep)
      }
    }
    if (cache.ranged) {
      this.creep.rangedAttack(tgt)
    } else {
      this.creep.attack(tgt)
    }
  },
  cleaningCrew (roomName) {
    const { room } = this.creep
    const log = this.log.withPrefix(`[CleaningCrew]`)
    log.alert(`Cleaner active ${roomName}`)
    if (room.name !== roomName) {
      this.push('moveToRoom', roomName)
      this.creep.say(`mv ${roomName}`)
      return this.runStack()
    }
    const tower = this.creep.pos.findClosestByRange(room.towers)
    let tgt
    if (tower) {
      tgt = tower
    }
    if (!tgt && room.spawns) {
      tgt = this.creep.pos.findClosestByRange(room.spawns)
    }
    if (!tgt && room.extensions) {
      tgt = this.creep.pos.findClosestByRange(room.extensions)
    }
    if (!tgt && room.walls) {
      tgt = this.creep.pos.findClosestByRange(room.walls)
    }
    if (!tgt && room.ramparts) {
      tgt = this.creep.pos.findClosestByRange(room.ramparts)
    }
    if (!tgt) {
      const sites = room.find(C.FIND_HOSTILE_CONSTRUCTION_SITES)
      if (sites.length) {
        tgt = this.creep.pos.findClosestByRange(sites)
        this.push('moveTo', tgt.pos)
        return this.runStack()
      }
    }
    if (tgt) {
      this.push('dismantle', tgt.id)
      this.push('moveNear', tgt.id)
    } else {
      return this.creep.say('No tgt')
    }
    return this.runStack()
  }
}
