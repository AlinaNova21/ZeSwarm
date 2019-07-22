import C from './constants'
import { distanceTransform, blockablePixelsForRoom, invertMatrix, multMatrix } from './DistanceTransform'
import { kernel } from '/kernel'

export let census = {}

kernel.createThread('csiteVisualizer', csiteVisualizer())
kernel.createThread('layoutThread', layoutThread())

function * csiteVisualizer () {
  while(true) {
    for (const csite of Object.values(Game.constructionSites)) {
      csite.room.visual.structure(csite.pos.x, csite.pos.y, csite.structureType, { opacity: 0.5 })
    }
    yield
  }
}

export function * layoutThread () {
  while (true) {
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName]
      if (room.controller && room.controller.my) {
        yield * flex(room)
      }
      yield true
    }
    yield
  }
}

export function * rampartThemAll (room) {
  const positions = new Set()
  const structures = room.structures.all
  // TODO
}

export function * flex (room) {
  if (_.size(Game.constructionSites) >= 50) return
  const { controller: { level } } = room
  const offGrid = [C.STRUCTURE_CONTAINER, C.STRUCTURE_ROAD]
  const wanted = [C.STRUCTURE_SPAWN, C.STRUCTURE_CONTAINER, C.STRUCTURE_TOWER, C.STRUCTURE_EXTENSION, C.STRUCTURE_STORAGE, C.STRUCTURE_TERMINAL]
  const want = _.mapValues(_.pick(C.CONTROLLER_STRUCTURES, wanted), level)
  const allSites = room.find(C.FIND_MY_CONSTRUCTION_SITES)
  const sites = _.groupBy(allSites, 'structureType')
  const have = _.mapValues(room.structures, 'length')

  // if (allSites.length) return

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
  if (!Object.keys(want).length) return
  const walkable = blockablePixelsForRoom(room.name)
  const distance = multMatrix(invertMatrix(distanceTransform(walkable), 8), 3)
  // this.drawCostMatrix(distance)
  const src = room.spawns[0] || room.structures.all.find(s => s.my && s.structureType !== STRUCTURE_CONTROLLER) || room.controller
  for (const type in want) {
    const amount = want[type] - ((have[type] || 0) + (sites[type] || []).length)
    // console.log(type, want[type], have[type] || 0, (sites[type] || []).length)
    if (amount <= 0) continue
    const positions = [
      ...allSites,
      ...room.structures.all,
      ...room.find(C.FIND_EXIT),
      ...room.find(C.FIND_SOURCES)
    ].map(getRange)
    console.log(`Want ${amount} of ${type}`)
    const pos = findPos(src.pos, positions, offGrid.includes(type), distance)
    if (pos) {
      room.createConstructionSite(pos, type)
      return
    }
  }
}
function getRange (s) {
  let range = 1
  let { pos, x, y, roomName } = s
  if (!pos) pos = { x, y, roomName }
  switch (s.structureType || s.type || '') {
    case '':
    case 'exit':
    case 'source':
      range = 3
      break
    case 'controller':
      range = 4
    case 'spawn':
      // range = 3
      break
  }
  return { pos, range }
}
function findPos (origin, avoid, invert = false, cmBase = false) {
  console.log('findPos', invert, origin, avoid)
  const result = PathFinder.search(origin, avoid, {
    flee: true,
    swampCost: 1,
    plainCost: 1,
    heuristicWeight: 1,
    roomCallback (room) {
      const cm = cmBase || new PathFinder.CostMatrix()
      for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
          let grid = x % 2 === y % 2
          if (invert) grid = !grid
          const v = grid && x > 2 && x < 48 && y > 2 && y < 48
          if (!v) cm.set(x, y, 255)
        }
      }
      avoid.forEach(({ pos: { x, y } }) => cm.set(x, y, 2))
      return cm
    }
  })
  if (result && result.path.length) {
    const vis = new RoomVisual()
    vis.poly(result.path.map(({ x, y }) => [x, y]), { stroke: 'red' })
    return result.path.slice(-1)[0]
  }
}
function drawCostMatrix (costMatrix, color = '#FF0000') {
  var vis = new RoomVisual();
  var x, y, v;
  var max = 1;
  for (y = 0; y < 50; ++y) {
    for (x = 0; x < 50; ++x) {
      v = costMatrix.get(x, y);
      max = Math.max(max, v);
    }
  }

  for (y = 0; y < 50; ++y) {
    for (x = 0; x < 50; ++x) {
      v = costMatrix.get(x, y);
      if (v > 0) {
        vis.circle(x, y, {radius:v/max/2, fill:color, opacity:0.5});
        vis.text(v, x, y+0.25, {size:v/max, color: 'black',outline:'#ccc', opacity:0.5});
      }
    }
  }
}
