import C from '/include/constants'

export default class IntTest {
  constructor (context) {
    this.context = context
    this.kernel = context.queryPosisInterface('baseKernel')
    this.mm = context.queryPosisInterface('memoryManager')
  }

  get log () {
    return this.context.log
  }

  run () {
    this.kernel.setInterrupt(C.INT_TYPE.VISION, C.INT_STAGE.START)
    if (this.mm.load(C.SEGMENTS.INTEL) === false) {
      this.mm.activate(C.SEGMENTS.INTEL)
      this.kernel.clearAllInterrupts()
      this.kernel.wait(C.INT_TYPE.SEGMENT, C.INT_STAGE.START, C.SEGMENTS.INTEL)
    }
  }

  interrupt ({ hook: { type, stage }, key }) {
    let room = Game.rooms[key]
    let mem = this.mm.load(C.SEGMENTS.INTEL)
    let hr = mem.rooms = mem.rooms || {}
    let {
      name,
      controller: {
        id,
        level,
        pos,
        my,
        safeMode,
        owner: { username } = {}
      } = {}
    } = room

    let structs = room.structures.all
    let byType = room.structures
    let [ mineral ] = room.find(C.FIND_MINERALS)
    let { mineralType } = mineral || {}
    let smap = ({ id, pos }) => ({ id, pos })
    let cmap = ({ id, pos, body, hits, hitsMax }) => ({ id, pos, body, hits, hitsMax })
    hr[room.name] = {
      hostile: level && !my,
      name,
      level,
      username,
      spawns: room.spawns.map(smap),
      towers: room.towers.map(smap),
      walls: room.walls.length,
      ramparts: room.ramparts.length,
      creeps: room.find(C.FIND_HOSTILE_CREEPS).map(cmap),
      safemode: safeMode || 0,
      controller: id && { id, pos },
      sources: room.find(C.FIND_SOURCES).map(smap),
      mineral: mineralType,
      ts: Game.time
    }
    this.mm.save(C.SEGMENTS.INTEL, mem)
  }
}
