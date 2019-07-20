const C = require('./constants')
const { distanceTransform, blockablePixelsForRoom } = require('./DistanceTransform')

module.exports = {
  run () {
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName]
      if (room.controller && room.controller.my) {
        this.flex(room)
      }
    }
  },
  fixed () {
    const { room, room: { controller: { level } } } = this
  },
  flex (room) {
    if (_.size(Game.constructionSites) >= 50) return
    const { controller: { level } } = room
    const offGrid = [C.STRUCTURE_CONTAINER, C.STRUCTURE_ROAD]
    const wanted = [C.STRUCTURE_SPAWN, C.STRUCTURE_CONTAINER, C.STRUCTURE_TOWER, C.STRUCTURE_EXTENSION, C.STRUCTURE_STORAGE, C.STRUCTURE_TERMINAL]
    const want = _.mapValues(_.pick(C.CONTROLLER_STRUCTURES, wanted), level)
    const allSites = room.find(C.FIND_MY_CONSTRUCTION_SITES)
    const sites = _.groupBy(allSites, 'structureType')
    const have = _.mapValues(room.structures, 'length')

    if (allSites.length) return

    if (level > 1) {
      want[C.STRUCTURE_CONTAINER] = 1 // Math.min(level, C.CONTROLLER_STRUCTURES[C.STRUCTURE_CONTAINER][level])
    }
    if (level <= 1 || level >= 4) {
      want[C.STRUCTURE_CONTAINER] = 0
    }
    // if (level < 3) {
    //   want[C.STRUCTURE_EXTENSION] = 0
    //   want[C.STRUCTURE_CONTAINER] = 0
    // }
    const src = room.spawns[0] || room.controller
    for (const type in want) {
      const amount = want[type] - ((have[type] || 0) + (sites[type] || []).length)
      // console.log(type, want[type], have[type] || 0, (sites[type] || []).length)
      if (amount <= 0) continue
      const positions = [
        ...allSites,
        ...room.structures.all,
        ...room.find(C.FIND_EXIT),
        ...room.find(C.FIND_SOURCES)
      ].map(this.getRange)
      console.log(`Want ${amount} of ${type}`)
      const pos = this.findPos(src.pos, positions, offGrid.includes(type))
      if (pos) {
        room.createConstructionSite(pos, type)
        return
      }
    }
  },
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
      case 'spawn':
        // range = 3
        break
    }
    return { pos, range }
  },
  findPos (origin, avoid, invert = false) {
    console.log('findPos', invert, origin, avoid)
    const result = PathFinder.search(origin, avoid, {
      flee: true,
      roomCallback (room) {
        const cm = new PathFinder.CostMatrix()
        for (let x = 0; x < 50; x++) {
          for (let y = 0; y < 50; y++) {
            let grid = x % 2 === y % 2
            if (invert) grid = !grid
            const v = grid && x > 2 && x < 48 && y > 2 && y < 48
            if (!v) cm.set(x, y, 255)
          }
        }
        avoid.forEach(({ pos: { x, y } }) => cm.set(x, y, 254))
        return cm
      }
    })
    if (result && result.path.length) {
      const vis = new RoomVisual()
      vis.poly(result.path.map(({ x, y }) => [x, y]), { stroke: 'red' })
      return result.path.slice(-1)[0]
    }
  },
  toString () {
    return this.roomName
  }
}
