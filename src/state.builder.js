const C = require('constants')

module.exports = {
  builder (cache = {}) {
    if (!cache.work) {
      cache.work = this.creep.getActiveBodyparts(C.WORK)
    }
    const { room, pos } = this.creep
    if (this.creep.carry.energy) {
      this.status = 'Looking for target'
      let sites = room.find(C.FIND_MY_CONSTRUCTION_SITES)
      if (!sites.length) return this.pop()
      sites = _.sortBy(sites, site => -site.progress / site.progressTotal)
      let site = _.first(sites) // pos.findClosestByRange(sites)
      let hitsMax = Math.ceil(this.creep.carry.energy / (cache.work * C.BUILD_POWER))
      if (this.creep.pos.isEqualTo(site.pos)) {
        this.creep.move(Math.ceil(Math.random() * 7))
        return
      }
      this.push('repeat', hitsMax, 'build', site.id)
      this.push('moveInRange', site.id, 3)
      this.runStack()
    } else {
      this.pop()
    }
  }
}