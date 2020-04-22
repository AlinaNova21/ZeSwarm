import C from '/constants'
import * as R from 'ramda'

const minHP = R.reduce(R.minBy(R.prop('hits')), Infinity)
// const maxHP = R.reduce(R.maxBy(R.prop('hits')), Infinity)
// const maxProg = R.reduce(R.minBy(site => site.progress / site.progressTotal))

export default {
  builder (cache = {}) {
    const parts = R.memoizeWith(R.identity, type => this.creep.getActiveBodyparts(type))
    if (!cache.work) {
      cache.work = parts(C.WORK) // this.creep.getActiveBodyparts(C.WORK)
    }
    const { room, pos } = this.creep
    if (this.creep.carry.energy) {
      this.status = 'Looking for target'
      const sites = room.find(C.FIND_MY_CONSTRUCTION_SITES)
      if (!sites.length) {
        const ramparts = pos.findInRange(C.FIND_MY_STRUCTURES, 3, { filter: { structureType: C.STRUCTURE_RAMPART } })
        if (ramparts.length) {
          const rampart = minHP(ramparts)
          const hitsMax = Math.ceil(this.creep.carry.energy / (parts(C.WORK) * C.REPAIR_POWER * C.REPAIR_COST))
          this.push('repeat', hitsMax, 'repair', rampart.id)
          return this.runStack()
        }
        return this.pop()
      }
      const priority = {
        [C.STRUCTURE_EXTENSION]: 2,
        [C.STRUCTURE_TOWER]: 3,
        [C.STRUCTURE_SPAWN]: 5
      }
      const [site] = sites.reduce(([tgt, v1], site) => {
        const v2 = (priority[site.structureType] || 1) * site.progress / site.progressTotal
        return v1 < v2 ? [site, v2] : [tgt, v1]
      }, [null, -1])
      // sites = sortBy(sites, site => (priority[site.structureType] || 1) * site.progress / site.progressTotal)
      // const site = first(sites) // pos.findClosestByRange(sites)
      if (this.creep.pos.isEqualTo(site.pos)) {
        this.creep.move(Math.ceil(Math.random() * 7))
        return
      }
      if (site.structureType === C.STRUCTURE_RAMPART) {
        // const maxRepairHits = R.pipe(R.subtract(R.__, C.BUILD_POWER), R.divide(R.__, parts(C.WORK) * C.REPAIR_POWER * C.REPAIR_COST), R.ceil)
        // const hitsMax = maxRepairHits(this.creep.energy)
        const hitsMax = Math.ceil((this.creep.carry.energy - (parts(C.WORK) * C.BUILD_POWER)) / (parts(C.WORK) * C.REPAIR_POWER * C.REPAIR_COST))
        this.push('resolvePos', site.pos, C.STRUCTURE_RAMPART, 'repeat', hitsMax, 'repair')
        this.push('build', site.id)
      } else {
        const rem = site.progressTotal - site.progress
        const hitsMax = Math.ceil(Math.min(rem, this.creep.carry.energy) / (parts(C.WORK) * C.BUILD_POWER))
        this.push('repeat', hitsMax, 'build', site.id)
      }
      this.push('moveInRange', site.id, 3)
      this.runStack()
    } else {
      this.pop()
    }
  }
}
