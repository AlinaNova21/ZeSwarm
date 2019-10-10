/* global StructureController */
import C from './constants'
import { distanceTransform, blockablePixelsForRoom, invertMatrix, multMatrix } from './DistanceTransform'
import { kernel, restartThread } from '/kernel'
import { sleep } from './kernel'
import minCut from './lib/mincut'

import groupBy from 'lodash/groupBy'
import mapValues from 'lodash/mapValues'
import pick from 'lodash/pick'
import size from 'lodash/size'

export const census = {}

// kernel.createThread('csiteVisualizer', restartThread(() => csiteVisualizer()))
// kernel.createThread('layoutThread', restartThread(() => layoutThread()))

kernel.createProcess('LayoutManager', restartThread, layoutManager)

function * layoutManager () {
  while (true) {
    if (!this.hasThread('csiteVisualizer')) {
      this.createThread('csiteVisualizer', csiteVisualizer)
    }
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName]
      if (room && room.controller && room.controller.my) {
        if (!this.hasThread(roomName)) {
          this.createThread(roomName, layoutRoom, room)
        }
      }
    }
    yield sleep(100)
  }
}

function * csiteVisualizer () {
  while (true) {
    for (const csite of Object.values(Game.constructionSites)) {
      if (!csite.room) continue
      csite.room.visual.structure(csite.pos.x, csite.pos.y, csite.structureType, { opacity: 0.5 })
    }
    yield
  }
}

function * layoutRoom (roomName) {
  while (true) {
    yield true
    const room = Game.rooms[roomName]
    if (!room || !room.controller || !room.controller.my) return
    yield * flex(room)
    if (room.controller.level >= 4) {
      yield * walls(room)
    }
    yield * sleep(20)
  }
}

function * walls (room) {
  let cpu = Game.cpu.getUsed()
  // Rectangle Array, the Rectangles will be protected by the returned tiles
  let [x1, y1, x2, y2] = [50, 50, 0, 0]
  const rectArray = []
  const ignore = [C.STRUCTURE_CONTROLLER, C.STRUCTURE_RAMPART, C.STRUCTURE_WALL]
  room.structures.all
    .filter(s => !ignore.includes(s.structureType))
    .forEach(s => {
      x1 = Math.min(x1, s.pos.x)
      y1 = Math.min(y1, s.pos.y)
      x2 = Math.max(x2, s.pos.x)
      y2 = Math.max(y2, s.pos.y)
    })
  x1 -= 4
  y1 -= 4
  x2 += 4
  y2 += 4
  rectArray.push({ x1, y1, x2, y2 })
  // rectArray.push({ x1: 20, y1: 6, x2: 28, y2: 27 })
  // rectArray.push({ x1: 29, y1: 13, x2: 34, y2: 16 })
  rectArray.forEach(r => {
    room.visual.rect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1)
  })
  // Boundary Array for Maximum Range
  const bounds = { x1: 0, y1: 0, x2: 49, y2: 49 }
  // Get Min cut
  try {
    const positions = minCut.GetCutTiles(room.name, rectArray, bounds) // Positions is an array where to build walls/ramparts
    // Test output
    this.log.info('Positions returned', positions.length)
    cpu = Game.cpu.getUsed() - cpu
    this.log.info('Needed', cpu, ' cpu time')
    for (const { x, y } of positions) {
      room.createConstructionSite(x, y, C.STRUCTURE_RAMPART)
      yield
    }
  } catch (err) {
    this.log.error(err.stack)
  }
}

function * flex (room) {
  if (size(Game.constructionSites) >= 75) return
  const { controller: { level } } = room
  const offGrid = [C.STRUCTURE_CONTAINER, C.STRUCTURE_ROAD]
  const wanted = [C.STRUCTURE_SPAWN, C.STRUCTURE_CONTAINER, C.STRUCTURE_TOWER, C.STRUCTURE_EXTENSION, C.STRUCTURE_STORAGE, C.STRUCTURE_TERMINAL]
  const want = mapValues(pick(C.CONTROLLER_STRUCTURES, wanted), level)
  const allSites = room.find(C.FIND_MY_CONSTRUCTION_SITES)
  const sites = groupBy(allSites, 'structureType')
  const have = mapValues(room.structures, 'length')

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
  const ignore = [C.STRUCTURE_CONTROLLER, C.STRUCTURE_WALL, C.STRUCTURE_RAMPART]
  const src = room.spawns.filter(s => s.my)[0] || room.structures.all.find(s => s.my && ignore.includes(s.structureType)) || room.controller
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
    this.log.info(`Want ${amount} of ${type}`)
    if (type === C.STRUCTURE_SPAWN && !have[C.STRUCTURE_SPAWN] && memSrc) {
      const ret = room.createConstructionSite(memSrc, C.STRUCTURE_SPAWN)
      if (ret !== C.OK) {
        this.log.info(`Couldn't create spawn at ${memSrc}: ${ret}`)
      } else {
        return
      }
    }
    const pos = findPos(memSrc || src.pos, positions, offGrid.includes(type), distance)
    if (pos) {
      room.createConstructionSite(pos, type)
      return
    } else {
      this.log.info(`Couldn't find position for ${type} with src ${src} and memSrc ${memSrc} pos is ${typeof pos}`)
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
      break
    case 'spawn':
      // range = 3
      break
  }
  return { pos, range }
}
function findPos (origin, avoid, invert = false, cmBase = false) {
  this.log.info('findPos', invert, origin)
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
    this.log.alert(`Layout path failed ${JSON.stringify(result)}`)
  }
}
// eslint-disable-next-line no-unused-vars
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
