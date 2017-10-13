const C = require('constants')

class Controller {
  run (controller) {
    let { level, room } = controller
    let offGrid = [C.STRUCTURE_CONTAINER, C.STRUCTURE_ROAD]
    let wanted = [C.STRUCTURE_TOWER, C.STRUCTURE_EXTENSION, C.STRUCTURE_STORAGE, C.STRUCTURE_SPAWN]
    let want = _.mapValues(_.pick(C.CONTROLLER_STRUCTURES, wanted), level)
    let allSites = room.find(C.FIND_MY_CONSTRUCTION_SITES)
    let sites = _.groupBy(allSites, 'structureType')
    let have = _.mapValues(room.structures, 'length')
    if (level > 1) {
      want[C.STRUCTURE_CONTAINER] = Math.min(level, C.CONTROLLER_STRUCTURES[C.STRUCTURE_CONTAINER][level])
    }
    // if (level < 3) {
    //   want[C.STRUCTURE_EXTENSION] = 0
    //   want[C.STRUCTURE_CONTAINER] = 0
    // }
    for (let type in want) {
      let amount = want[type] - ((have[type] || 0) + (sites[type] || []).length)
      // console.log(type,want[type],have[type] || 0, (sites[type] || []).length)
      if (amount <= 0) continue
      let positions = [
        ...allSites,
        ...room.structures.all,
        ...room.find(C.FIND_EXIT),
        ...room.find(C.FIND_SOURCES)
      ].map(this.getRange)
      let pos = this.findPos(controller.pos, positions, offGrid.includes(type))
      if (pos) {
        room.createConstructionSite(pos, type)
        return
      }
    }
  }

  getRange (s) {
    let range = 1
    let { pos, x, y, roomName } = s
    if (!pos) pos = { x, y, roomName }
    switch (s.structureType || s.type || '') {
      case '':
      case 'exit':
      case 'controller':
      case 'source':
        range = 3
        break
    }
    return { pos, range }
  }

  findPos (origin, avoid, invert = false) {
    console.log('findPos', invert, origin, avoid)
    let result = PathFinder.search(origin, avoid, {
      flee: true,
      roomCallback (room) {
        let cm = new PathFinder.CostMatrix()
        for (let x = 0; x < 50; x++) {
          for (let y = 0; y < 50; y++) {
            let grid = x % 2 === y % 2
            if (invert) grid = !grid
            let v = grid && x > 2 && x < 48 && y > 2 && y < 48
            if (!v) cm.set(x, y, 255)
          }
        }
        return cm
      }
    })
    if (result && result.path.length) {
      return result.path.slice(-1)[0]
    }
  }
}

module.exports = Controller
