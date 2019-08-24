import C from './constants'
import { distanceTransform, blockablePixelsForRoom, invertMatrix, multMatrix } from './DistanceTransform'
import { kernel, restartThread } from '/kernel'
import { Logger } from './log'
import { sleep } from './kernel'

const log = new Logger('[LayoutManager]')

export const census = {}

kernel.createThread('csiteVisualizer', restartThread(() => csiteVisualizer()))
kernel.createThread('layoutThread', restartThread(() => layoutThread()))

function * csiteVisualizer () {
  while (true) {
    for (const csite of Object.values(Game.constructionSites)) {
      if (!csite.room) continue
      csite.room.visual.structure(csite.pos.x, csite.pos.y, csite.structureType, { opacity: 0.5 })
    }
    yield
  }
}

export function * layoutThread () {
  while (true) {
    yield true
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName]
      const planFlag = Game.flags.plan
      if (room && room.controller && room.controller.my) {
        yield * flex(room)
      }
      yield true
    }
    yield * sleep(10)
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
  // if (room.name === 'W8S6') drawCostMatrix(distance)
  const memSrc = room.memory.layoutStart && new RoomPosition(room.memory.layoutStart[0], room.memory.layoutStart[1], room.name)
  const src = room.spawns.filter(s => s.my)[0] || room.structures.all.find(s => s.my && s.structureType !== STRUCTURE_CONTROLLER) || room.controller
  if (!(src instanceof StructureController)) {
    const { x, y } = src.pos
    room.memory.layoutStart = [x, y]
  }
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
    if (type === STRUCTURE_SPAWN && !have[STRUCTURE_SPAWN] && memSrc) {
      room.createConstructionSite(memSrc, STRUCTURE_SPAWN)
      return
    }
    const pos = findPos(memSrc || src.pos, positions, offGrid.includes(type), distance)
    if (pos) {
      room.createConstructionSite(pos, type)
      return
    } else {
      console.log(`Couldn't find position for ${type} with src ${src} and memSrc ${memSrc} pos is ${typeof pos}`)
    }
    yield true
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
      range = 5
    case 'spawn':
      // range = 3
      break
  }
  return { pos, range }
}
function findPos (origin, avoid, invert = false, cmBase = false) {
  console.log('findPos', invert, origin, JSON.stringify(avoid))
  const { visual } = Game.rooms[origin.roomName]
  avoid.forEach(a => visual.circle(a.pos.x, a.pos.y, { radius: a.range, fill: 'red' }))
  // const ind = avoid.findIndex(a => a.pos.x === origin.x && a.pos.y === origin.y)
  // if (ind >= 0) avoid.splice(ind, 1)
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
      const { x, y } = Game.rooms[room].controller.pos
      for (let xo = -1; xo < 2; xo++) {
        for (let yo = -1; yo < 2; yo++) {
          cm.set(x + xo, y + yo, 2)
        }
      }
      avoid.forEach(({ pos: { x, y } }) => cm.set(x, y, 2))
      Game.rooms[room].constructedWalls.forEach(({ pos: { x, y } }) => cm.set(x, y, 255))
      return cm
    }
  })
  // if (origin.roomName === 'W8S6') drawCostMatrix(cmBase, '#ff0000')
  if (result && result.path.length) {
    const vis = new RoomVisual(origin.roomName)
    vis.poly(result.path.map(({ x, y }) => [x, y]), { stroke: 'red' })
    return result.path.slice(-1)[0]
  } else {
    log.alert(`Layout path failed ${JSON.stringify(result)}`)
  }
}
function drawCostMatrix (costMatrix, color = '#FF0000', visual) {
  var vis = visual || new RoomVisual()
  var x, y, v
  var max = 1
  for (y = 0; y < 50; ++y) {
    for (x = 0; x < 50; ++x) {
      v = costMatrix.get(x, y)
      max = Math.max(max, v)
    }
  }

  for (y = 0; y < 50; ++y) {
    for (x = 0; x < 50; ++x) {
      v = costMatrix.get(x, y)
      if (v > 0) {
        vis.circle(x, y, { radius: v / max / 2, fill: color, opacity: 0.5 })
        vis.text(v, x, y + 0.25, { size: v / max, color: 'black', outline: '#ccc', opacity: 0.5 })
      }
    }
  }
}
