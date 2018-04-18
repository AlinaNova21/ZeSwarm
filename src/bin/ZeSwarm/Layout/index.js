import BaseProcess from '../BaseProcess'
import C from '/include/constants'
import map from 'lodash-es/map'
import each from 'lodash-es/each'
import invoke from 'lodash-es/invoke'
import filter from 'lodash-es/filter'
import layouts from './static'
import { distanceTransform, blockablePixelsForRoom } from '/lib/DistanceTransform'

export default class Layout extends BaseProcess {
  constructor (context) {
    super(context)
    this.context = context
    this.kernel = context.queryPosisInterface('baseKernel')
    this.mm = context.queryPosisInterface('segments')
  }

  get roomName () {
    return this.memory.room
  }

  get room () {
    return Game.rooms[this.roomName]
  }

  run () {
    this.flex()
  }

  fixed () {
    const { room, room: { controller: { level } } } = this
    
  }

  flex () {
    this.sleep.sleep(10)
    if (_.size(Game.constructionSites) === 100) return
    const room = this.room
    const { controller: { level } } = this.room
    let offGrid = [C.STRUCTURE_CONTAINER, C.STRUCTURE_ROAD]
    let wanted = [C.STRUCTURE_TOWER, C.STRUCTURE_EXTENSION, C.STRUCTURE_STORAGE, C.STRUCTURE_SPAWN, C.STRUCTURE_TERMINAL]
    let want = _.mapValues(_.pick(C.CONTROLLER_STRUCTURES, wanted), level)
    let allSites = room.find(C.FIND_MY_CONSTRUCTION_SITES)
    let sites = _.groupBy(allSites, 'structureType')
    let have = _.mapValues(room.structures, 'length')
    if (level > 1) {
      want[C.STRUCTURE_CONTAINER] = Math.min(level, C.CONTROLLER_STRUCTURES[C.STRUCTURE_CONTAINER][level])
    }
    if (level >= 4) {
      want[C.STRUCTURE_CONTAINER] = 0
    }
    // if (level < 3) {
    //   want[C.STRUCTURE_EXTENSION] = 0
    //   want[C.STRUCTURE_CONTAINER] = 0
    // }
    let src = room.spawns[0] || room.controller
    for (let type in want) {
      let amount = want[type] - ((have[type] || 0) + (sites[type] || []).length)
      console.log(type, want[type], have[type] || 0, (sites[type] || []).length)
      if (amount <= 0) continue
      let positions = [
        ...allSites,
        ...room.structures.all,
        ...room.find(C.FIND_EXIT),
        ...room.find(C.FIND_SOURCES)
      ].map(this.getRange)
      console.log(`Want ${amount} of ${type}`)
      let pos = this.findPos(src.pos, positions, offGrid.includes(type))
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
      case 'spawn':
        // range = 3
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
        avoid.forEach(({ pos: { x, y } }) => cm.set(x, y, 254))
        return cm
      }
    })
    if (result && result.path.length) {
      let vis = new RoomVisual()
      vis.poly(result.path.map(({x, y}) => [x, y]), { stroke: 'red' })
      return result.path.slice(-1)[0]
    }
  }
  toString () {
    return this.roomName
  }
}
