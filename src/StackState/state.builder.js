import C from '/constants'
import sortBy from 'lodash/sortBy'
import first from 'lodash/first'

export default {
  builder (cache = {}) {
    if (!cache.work) {
      cache.work = this.creep.getActiveBodyparts(C.WORK)
    }
    const { room, pos } = this.creep
    if (this.creep.carry.energy) {
      this.status = 'Looking for target'
      let sites = room.find(C.FIND_MY_CONSTRUCTION_SITES)
      if (!sites.length) {
        const ramparts = pos.findInRange(C.FIND_MY_STRUCTURES, 3, { filter: { structureType: C.STRUCTURE_RAMPART } })
        if (ramparts.length) {
          const rampart = ramparts.reduce((l, v) => l && l.hits < v.hits ? l : v, null)
          const hitsMax = Math.ceil(this.creep.carry.energy / (cache.work * C.REPAIR_POWER * C.REPAIR_COST))
          this.push('repeat', hitsMax, 'repair', rampart.id)
          return this.runStack()
        }
        return this.pop()
      }
      sites = sortBy(sites, site => -site.progress / site.progressTotal)
      const site = first(sites) // pos.findClosestByRange(sites)
      if (this.creep.pos.isEqualTo(site.pos)) {
        this.creep.move(Math.ceil(Math.random() * 7))
        return
      }
      if (site.structureType === C.STRUCTURE_RAMPART) {
        const hitsMax = Math.ceil((this.creep.carry.energy - (cache.work * C.BUILD_POWER)) / (cache.work * C.REPAIR_POWER * C.REPAIR_COST))
        this.push('resolvePos', site.pos, C.STRUCTURE_RAMPART, 'repeat', hitsMax, 'repair')
        this.push('build', site.id)
      } else {
        const rem = site.progressTotal - site.progress
        const hitsMax = Math.ceil(Math.min(rem, this.creep.carry.energy) / (cache.work * C.BUILD_POWER))
        this.push('repeat', hitsMax, 'build', site.id)
      }
      this.push('moveInRange', site.id, 3)
      this.runStack()
    } else {
      this.pop()
    }
  }
}
