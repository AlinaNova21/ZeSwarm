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

const multipleList = [
  STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_ROAD, STRUCTURE_WALL,
  STRUCTURE_RAMPART, STRUCTURE_KEEPER_LAIR, STRUCTURE_PORTAL, STRUCTURE_LINK,
  STRUCTURE_TOWER, STRUCTURE_LAB, STRUCTURE_CONTAINER
]

const singleList = [
  STRUCTURE_OBSERVER, STRUCTURE_POWER_BANK, STRUCTURE_POWER_SPAWN, STRUCTURE_EXTRACTOR,
  STRUCTURE_NUKER        // STRUCTURE_TERMINAL,   STRUCTURE_CONTROLLER,   STRUCTURE_STORAGE,
]

let obj = {
  lookNear: {
    value: function (type, pos) {
      let { x, y } = pos.pos || pos
      let res = []
      for(let yo = -1; yo <= 1; yo++) {
        if(y + yo > 49 || y + yo < 0) continue
        for(let xo = -1; xo <= 1; xo++) {
          if(x + xo > 49 || x + xo < 0) continue
          res.push(...this.lookForAt(type, x + xo, y + yo))
        }
      }
      return res
    },
    enumerable: false,
    configurable: true
  },
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

multipleList.forEach(function (type) {
  obj[type + 's'] = {
    get: function () {
      return this.structures[type] || []
    },
    enumerable: false,
    configurable: true
  }
})

singleList.forEach(function (type) {
  obj[type] = {
    get: function () {
      return (this.structures[type] || [])[0]
    },
    enumerable: false,
    configurable: true
  }
})

export default obj
