const C = require('/constants')

module.exports = {
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
