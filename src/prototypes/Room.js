import C from '/include/constants'
import isEmpty from 'lodash-es/isEmpty'
import groupBy from 'lodash-es/groupBy'
import each from 'lodash-es/each'

const STRUCTURES_TO_CHECK = [
  C.STRUCTURE_SPAWN,
  C.STRUCTURE_EXTENSION,
  C.STRUCTURE_STORAGE,
  C.STRUCTURE_TOWER,
  C.STRUCTURE_TERMINAL
  // Ignoring some for now
  // C.STRUCTURE_OBSERVER,
  // C.STRUCTURE_POWER_SPAWN,
  // C.STRUCTURE_NUKER,
  // C.STRUCTURE_LAB,
  // C.STRUCTURE_EXTRACTOR,
]

export default {
  structures: {
    get: function () {
      if (!this._structures || isEmpty(this._structures)) {
        this._all_structures = this.find(FIND_STRUCTURES)
        this._structures = groupBy(this._all_structures, 'structureType')
        this._structures.all = this._all_structures
      }
      return this._structures
    },
    enumerable: false,
    configurable: true
  },
  level: {
    get: function () {
      let RCL = this.controller && this.controller.level || 0
      let PRL = RCL
      each(STRUCTURES_TO_CHECK, (structure) => {
        let have = this.structures[structure] && this.structures[structure].length || 0
        for (let i = 0; i <= PRL; i++) {
          if (have < C.CONTROLLER_STRUCTURES[structure][i]) {
            PRL = (i - 1)
          }
        }
      })
      return PRL
    },
    configurable: true
  }
}
