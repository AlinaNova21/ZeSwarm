const C = require('/constants')

module.exports = {
  cleaningCrew (roomName) {
    const { room } = this.creep
    this.log.alert(`Cleaner active`)
    if (room.name !== roomName) {
      this.push('moveToRoom', roomName)
      this.creep.say(`mv ${roomName}`)
      return this.runStack()
    }
    console.log(room.spawns.length)
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
    if (!tgt) {
      const sites = room.find(FIND_HOSTILE_CONSTRUCTION_SITES)
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
