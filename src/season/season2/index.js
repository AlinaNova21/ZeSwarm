import C from "../../constants"
import { getSegment } from "../../MemoryManager"
import intel from '/Intel'
import { kernel, threadManager, sleep } from "../../kernel"
import { createTicket, expandBody } from '../../SpawnManager'
import groupBy from 'lodash/groupBy'
import config from '/config'
import { createNest } from '/ExpansionPlanner'
import { SYMBOL_COLORS, SYMBOL_MAP } from "./util"

const average = a => a.reduce((l,v) => l + v, 0) / a.length

if (Game.shard.name === 'shardSeason') {
  kernel.createProcess('SymbolManager', threadManager, [
    ['symbolManager', symbolManager],
    ['testing', testing]
  ])
}

const routeCache = new Map()

function findRoute(src, dst, opts = {}) {
  const key = src + dst
  if (!routeCache.has(key)) {
    const route = {
      ts: Game.time,
      path: Game.map.findRoute(src, dst, opts)
    }
    routeCache.set(key, route)
    return route.path
  }
  const route = routeCache.get(key)
  return route.path
}

function * seasonManualClaiming () {
  const targets = ['W21N12', 'W23N11']
  while (true) {
    const ownedRooms = Object.values(Game.rooms).filter(r => r.controller && r.controller.my)
    if (Game.gcl.level > ownedRooms.length) {
      const tgt = targets.find(t => !ownedRooms.find(r => r.name == t))
      if (tgt) {
        const [closestRoom, path] = ownedRooms
          .filter(r => r.controller.level >= 4)
          .map(r => [r, findRoute(tgt, r.name, {})])
          .filter(r => r[1] && r[1].length < 25)
          .reduce((l, n) => l && l[1].length < n[1].length ? l : n, null) || []
        if (!closestRoom) {
          this.log.warn(`Couldn't find room to claim ${tgt} from`)
          // this.log.warn(`Couldn't find room to deliver ${type} ${JSON.stringify(decoders[type])}`)
          continue
        }
        this.createThread(`claim_${tgt}`, createNest, closestRoom.name, tgt, Game.time + 2000)  
      }
    }
    yield * sleep(10)
  }
}

function * symbolManager () {
  this.log.info(`Loading Index Segment`)
  const index = yield * getSegment(80)
  index.api = {
    version: 'v1.0.0',
    update: Game.time
  }
  index.channels = index.channels || {}
  index.channels.symbols = index.channels.symbols || {}
  index.channels.symbols.segments = [81]
  const publicSegments = new Set()
  for (const name in index.channels) {
    for (const seg of index.channels[name].segments) {
      publicSegments.add(seg)
    }
  }
  RawMemory.setDefaultPublicSegment(80)
  RawMemory.setPublicSegments(Array.from(publicSegments))
  index.save()
  this.log.info(`Loading Symbols Segment`)
  const seg = yield* getSegment(81)
  while (true) {
    if (!this.hasThread('claiming')) {
      this.createThread('claiming', seasonManualClaiming)
    }
    index.channels.symbols.update = Game.time
    seg.decoders = []
    seg.containers = []
    for(const roomName in intel.rooms) {
      const room = intel.rooms[roomName]
      seg.decoders.push(...room.symbolDecoders.map(o => ({
        id: o.id,
        pos: [...o.pos, roomName],
        type: o.resourceType
      })))
      seg.containers.push(...room.symbolContainers.filter(o => o.decayTime > Game.time).map(o => ({
        id: o.id,
        pos: [...o.pos, roomName],
        type: o.resourceType,
        amount: o.amount,
        decayTime: o.decayTime,
        lastUpdated: room.ts
      })))
    }
    index.save()
    seg.save()
    // yield * sleep(5)
    this.log.info(`Tick ${Game.time} ${seg.decoders.length} ${seg.containers.length}`)
    yield* symbolGathering.call(this)
    yield* symbolDecoding.call(this)
    // createTicket('testing', {
    //   parent: 'room_W21N12',
    //   count: 2,
    //   weight: 100,
    //   body: [C.MOVE],
    //   memory: {
    //     stack: [
    //       ['scoutVision', 'W23N21']
    //     ]
    //   }
    // })
    yield
  }
}

function * symbolDecoding() {
  // const levels = Object.values(intel.rooms).filter(r => r.level).map(r => r.level)
  const DECODE_MIN_RCL = 8 // Math.floor(average(levels))
  const delivering = new Set()
  const decoders = groupBy(Object.values(intel.rooms).filter(r => r.symbolDecoders.length).map(r => ({ name: r.name, decoder: r.symbolDecoders[0] })), r => r.decoder.resourceType)
  for (const sym of SYMBOLS) {
    decoders[sym] = decoders[sym] || []
  }
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName]
    if (!room || !room.controller || !room.controller.my || !room.storage || room.storage.store.energy < 10000) continue
    for(const type in room.storage.store) {
      if (!SYMBOLS.includes(type)) continue
      const filt = r => {
        const int = intel.rooms[r.name]
        return int.owner
          && [C.USER.toLowerCase(), ...config.allies].includes(int.owner.toLowerCase())
          && int.level >= DECODE_MIN_RCL
      }
      const amt = room.storage.store[type]
      const [closestRoom, path] = decoders[type]
        .filter(filt)
        .map(r => [r, findRoute(roomName, r.name, {})])
        .filter(r => r[1] && r[1].length < 25)
        .reduce((l, n) => l && l[1].length < n[1].length ? l : n, null) || []
      if (!closestRoom) {
        // this.log.warn(`Couldn't find room to deliver ${type}`)
        // this.log.warn(`Couldn't find room to deliver ${type} ${JSON.stringify(decoders[type])}`)
        continue
      }
      // continue
      const maxBodyParts = Math.min(Math.ceil(room.storage.store[type] / 50), Math.floor(room.energyCapacityAvailable / 100))
      const stor = room.storage.safe()
      createTicket(`symbolDecoder_haulers_${closestRoom.name}`, {
        valid: () => stor.store[type],
        parent: `room_${roomName}`,
        count: 1, // Math.ceil(room.storage.store[type] || 1 / (maxBodyParts * 50)),
        weight: 2,
        body: expandBody([maxBodyParts, C.MOVE, maxBodyParts, C.CARRY]),
        memory: {
          role: 'hauler',
          stack: [['hauler', roomName, room.storage.id, closestRoom.name, closestRoom.decoder.id, type]]
        }
      })
      delivering.add(`${closestRoom.name} ${closestRoom.decoder.resourceType} ${stor.store[type]}`)
    }
  }

  this.log.info(`Delivering ${delivering.size} (${DECODE_MIN_RCL}) rooms: ${Array.from(delivering).join(',')}`)
  // let x = 1
  // let y = 6
  // const size = 1
  // const textStyle = { font: size, align: 'left' }
  // const vis = new RoomVisual()
  // vis.text('Symbol Collection:', x, y, textStyle)
  // y += size
  // for (const room of collecting) {
  //   const { symbolContainers = [] } = intel.rooms[room]
  //   for (const s of symbolContainers) {
  //     vis.text(`${room}: ${s.resourceType}=${s.amount} (${s.decayTime - Game.time})`, x, y, textStyle)
  //     y += size
  //   }
  // }
}

function* symbolGathering() {
  const roomIntel = Object.values(intel.rooms) // .filter(r => r.hostile)
  const monitoring = new Set()
  const collecting = new Set()
  const conts = new Set()
  for (const int of roomIntel) {
    const { name, symbolContainers = [] } = int
    for (const c of symbolContainers) {
      conts.add(c)
      if (int.ts + 10000 < Game.time) continue
      // continue // Disable this
      const dt = c.decayTime - Game.time
      if (dt < 100) continue
      const [closestRoom, path] = Object.values(Game.rooms)
        .filter(r => r.controller && r.controller.my && r.storage && r.storage.store.energy > 10000)
        .map(r => [r, findRoute(r.name, name, {})])
        .filter(r => r[1] && r[1].length < 15)
        .reduce((l, n) => l && l[1].length < n[1].length ? l : n, null) || []
      if (!closestRoom) {
        continue
      }
      if ((path.length * 50) > (dt + 50)) {
        continue
      }
      const rtt = path.length * 100
      const tripsPossible = Math.floor(1500 / rtt)
      const maxBodyParts = Math.min(Math.min(25, Math.ceil(c.amount / 50)), Math.floor(closestRoom.energyCapacityAvailable / 100))
      const tripsNeeded = Math.ceil(c.amount / (maxBodyParts * 50))
      const count = Math.ceil(tripsNeeded / tripsPossible)
      createTicket(`symbolContainer_haulers_${c.id}`, {
        valid: () => c.decayTime - Game.time > path.length * 50,
        parent: `room_${closestRoom.name}`,
        count, //: Math.ceil(c.amount || 1 / (maxBodyParts * 50)),
        weight: 1,
        body: expandBody([maxBodyParts, C.MOVE, maxBodyParts, C.CARRY]),
        memory: {
          role: 'hauler',
          stack: [['hauler', name, c.id, closestRoom.name, closestRoom.storage.id, c.resourceType]]
        }
      })
      const key = `symbolContainer:${c.id}`
      if (!this.hasThread(key)) {
        // this.createThread(key, symbolContainer, name, c.id, closestRoom.name, c.decayTime, path.length)
      }
      collecting.add(name)
    }
  }
  this.log.info(`Monitoring ${monitoring.size} rooms: ${Array.from(monitoring).join(',')}`)
  this.log.info(`Collecting ${collecting.size} rooms: ${Array.from(collecting).join(',')}`)
  let x = 1
  let y = 6
  const size = 1
  const textStyle = { font: `${size} sans-serif`, align: 'left' }
  const start = Game.cpu.getUsed()
  const vis = new RoomVisual()
  vis.text(`Score: ${Game.score}`, x, y, { ...textStyle, font: `bold ${size} sans-serif` })
  y += size
  for (const [sym, amt] of Object.entries(Game.symbols).sort((a,b) => a[1] - b[1])) {
    if (!amt) continue
    vis.resource(sym, x, y-0.3, size * 0.9)
    vis.text(`  ${sym.slice(7)}`, x, y, textStyle)
    vis.text(amt, x + 8, y, { ...textStyle, align: 'right' })
    y += size
  }
  y += size
  vis.text('Symbol Collection:', x, y, { ...textStyle, font: `bold ${size} sans-serif` })
  y += size
  // for(const room of collecting) {
  for (const int of roomIntel) {
    const room = int.name
    const { symbolContainers = [] } = int //intel.rooms[room]
    for (const s of symbolContainers) {
      if (s.decayTime < Game.time) continue
      const style = { ...textStyle, color: collecting.has(room) ? 'white' : 'gray' }
      vis.resource(s.resourceType, x + 5, y - 0.3, size * 0.9)
      vis.text(`${room}:     ${s.resourceType.slice(7)}=${s.amount} (${s.decayTime - Game.time})`, x, y, style)
      y += size
    }
  }
  const end = Game.cpu.getUsed()
  // vis.text(end - start, x, y, textStyle)
  // yield * sleep(5)
}

function* symbolContainer(roomName, scId, closestRoom, decayTime, dist) {
  while (intel.rooms[roomName] && intel.rooms[roomName].symbolContainers.length) {
    createTicket(`symbolContainer_haulers_${scId}`, {
      valid: () => decayTime - Game.time > dist * 50,
      parent: `room_${closestRoom}`,
      count: 1,
      weight: 2,
      body: expandBody([4, C.MOVE, 4, C.CARRY]),
      memory: {
        role: 'hauler',
        stack: [['hauler', roomName, scId, closestRoom, Game.rooms[closestRoom].storage.id, C.RESOURCE_SCORE]]
      }
    })
    yield
  }
}

function relPoly(x, y, poly, scale = 1) {
  return poly.map(p => {
    p[0] += x * scale
    p[1] += y * scale
    return p
  })
}
function * testing () {
  while(true) {    
    yield
    continue
    const start = Game.cpu.getUsed()
    const vis = new RoomVisual()
    SYMBOLS.forEach((sym, i) => vis.resource(sym, 1 + i, 25, 1))
    const end = Game.cpu.getUsed()
    const dur = end - start
    console.log(dur, SYMBOLS.length, dur / SYMBOLS.length)
    yield
  }
}