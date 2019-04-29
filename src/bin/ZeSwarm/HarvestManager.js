import each from 'lodash-es/each'
import C from '/include/constants'
import BaseProcess from './BaseProcess'

export default class HarvestManager extends BaseProcess {
  constructor (context) {
    super(context)
    this.context = context
    this.spawner = this.context.queryPosisInterface('spawn')
    this.kernel = this.context.queryPosisInterface('baseKernel')
    this.sleeper = this.context.queryPosisInterface('sleep')
    this.roads = {}
  }

  get room () {
    return Game.rooms[this.memory.room]
  }

  expand (body) {
    let cnt = 1
    let ret = []
    for (let i in body) {
      let t = body[i]
      if (typeof t === 'number') {
        cnt = t
      } else {
        for (let ii = 0; ii < cnt; ii++) {
          ret.push(t)
        }
      }
    }
    return ret
  }

  run () {
    this.sleeper.sleep(5)
    if (typeof this.memory.room === 'undefined') {
      throw new Error('Abort! Room not set')
    }
    if (!this.room) {
      this.log.warn(`No vision in ${this.memory.room}`)
      return
    }
    const sources = this.room.find(C.FIND_SOURCES)
    const minerals = this.room.find(C.FIND_MINERALS)
    const genCollBody = [
      this.expand([6, C.CARRY, 6, C.MOVE]),
      this.expand([4, C.CARRY, 4, C.MOVE]),
      this.expand([2, C.CARRY, 2, C.MOVE]),
      this.expand([1, C.CARRY, 1, C.MOVE])
    ]
    each(sources, source => {
      const hasRoad = this.roads[source.id] && this.roads[source.id].complete
      const maxParts = this.room.level > 2 && Math.min(hasRoad ? 33 : 25, Math.floor(((this.room.energyCapacity / 50) * 0.80) / 2)) || 1
      
      const spawnTicket = this.ensureCreep(`${source.id}_harv`, {
        rooms: [this.memory.room],
        body: [
          this.expand([1, C.CARRY, 6, C.WORK, 3, C.MOVE]),
          this.expand([1, C.CARRY, 5, C.WORK, 3, C.MOVE]),
          this.expand([1, C.CARRY, 4, C.WORK, 3, C.MOVE]),
          this.expand([1, C.CARRY, 3, C.WORK, 3, C.MOVE]),
          this.expand([1, C.CARRY, 2, C.WORK, 2, C.MOVE]),
          this.expand([1, C.CARRY, 1, C.WORK, 1, C.MOVE])
        ],
        priority: 2
      })
      this.ensureChild(spawnTicket, 'ZeSwarm/stackStateCreep', { spawnTicket, base: ['harvester', source.id] })

      const dist = (this.roads[source.id] && this.roads[source.id].path.length) || (this.storage && this.storage.pos.findPathTo(s).length) || 30
      const needed = Math.max(2, Math.ceil((source.energyCapacity / (C.ENERGY_REGEN_TIME / (dist * 2))) / 50)) + 2
      const wanted = Math.min(Math.ceil(needed / maxParts), 4)
      const cbody = [this.expand([maxParts, C.CARRY, hasRoad ? Math.ceil(maxParts / 2) : maxParts, C.MOVE])]
      const wbody = [this.expand([maxParts-1, C.CARRY, hasRoad ? Math.ceil(maxParts / 2) : maxParts, C.MOVE, 1, C.WORK])]
      for (let i = 1; i <= wanted; i++) {
        const spawnTicket = this.ensureCreep(`${source.id}_coll_${i+1}`, {
          rooms: [this.memory.room],
          body: i ? cbody : wbody,
          priority: 3
        })
        this.ensureChild(spawnTicket, 'ZeSwarm/stackStateCreep', { spawnTicket, base: ['collector', source.id] })
      }
    })
    if (CONTROLLER_STRUCTURES[C.STRUCTURE_EXTRACTOR][this.room.level]) {      
      each(minerals, mineral => {
        let [extractor] = mineral.pos.lookFor(C.LOOK_STRUCTURES)
        if (!extractor) {
          let [csite] = mineral.pos.lookFor(C.LOOK_CONSTRUCTION_SITES)
          if (!csite) {
            csite = mineral.pos.createConstructionSite(C.STRUCTURE_EXTRACTOR)
          }
          return
        }
        {
          let spawnTicket = this.ensureCreep(`${mineral.id}_harv`, {
            rooms: [this.memory.room],
            body: [
              this.expand([49, C.WORK, 1, C.MOVE]),
              this.expand([40, C.WORK, 1, C.MOVE]),
              this.expand([30, C.WORK, 1, C.MOVE]),
              this.expand([25, C.WORK, 1, C.MOVE]),
              this.expand([20, C.WORK, 1, C.MOVE]),
              this.expand([15, C.WORK, 1, C.MOVE]),
              this.expand([10, C.WORK, 1, C.MOVE]),
            ],
            priority: 8,
            maxRange: 1
          })
          this.ensureChild(spawnTicket, 'ZeSwarm/stackStateCreep', { spawnTicket, base: ['harvester', mineral.id] })
        }
        {
          let spawnTicket = this.ensureCreep(`${mineral.id}_coll_1`, {
            rooms: [this.memory.room],
            body: [
              this.expand([8, C.CARRY, 8, C.MOVE]),
            ],
            priority: 8,
            maxRange: 1
          })
          this.ensureChild(spawnTicket, 'ZeSwarm/stackStateCreep', { spawnTicket, base: ['collector', mineral.id, mineral.mineralType] })
        }
      })
    }
    this.buildRoads()
  }
  buildRoads (){
    const sources = this.room.find(C.FIND_SOURCES)
    const getStructureMatrix = this.getStructureMatrix
    each(sources, source => {
      const { id } = source
      if(!this.roads[id] || this.roads[id].expires < Game.time){
        const { storage, controller, spawn } = this.room
        // let tgt = storage 
        // if (controller && controller.level > 0) {
        //   storage = this.storage || spawn || null
        // }
        const tgt = storage || spawn
        if (!tgt) return
        const { path } = PathFinder.search(source.pos,{
          pos: tgt.pos, 
          range: 1
        },{
          plainCost:2,
          swampCost:5,
          roomCallback(room){ 
            if (!Game.rooms[room]) return
            return getStructureMatrix(Game.rooms[room])
          }
        })
        this.roads[id] = {
          path: path.slice(1).filter(({x, y})=>x > 0 && y > 0 && x < 49 && y < 49),
          expires: Game.time + 50,
          complete: false
        }
      }
      const road = this.roads[id]
      const next = road.path.find(r=>{
        let room = Game.rooms[r.roomName]
        return room && !room.lookForAt(C.LOOK_STRUCTURES, r.x, r.y).find(s => s.structureType === C.STRUCTURE_ROAD)
      })
      if (next) {
        road.complete = false
      } else {
        road.complete = true
        return
      }
      const nextRoom = Game.rooms[next.roomName]
      if (!nextRoom.lookForAt(C.LOOK_CONSTRUCTION_SITES, next.x, next.y).length) {
        nextRoom.createConstructionSite(next.x, next.y, STRUCTURE_ROAD)
        road.expires = Game.time
      }
      nextRoom.visual.poly(road.path.filter(r => r.roomName === nextRoom.name).map(r => [r.x,r.y]), { lineStyle: 'dashed', color: '#CCC' })
    })
  }
  getStructureMatrix (room) {
    if(room._structureMatrix && room._structureMatrixTick == Game.time) 
      return room._structureMatrix
    let matrix = new PathFinder.CostMatrix()
    room._structureMatrix = matrix
    room._structureMatrixTick = Game.time
    room.find(C.FIND_STRUCTURES).forEach(s=>{
      let cost = 0
      if(isObstacle(s))
        cost = 255
      if(s.structureType == C.STRUCTURE_ROAD)
        cost = 1
      matrix.set(s.pos.x,s.pos.y,cost)
    })  
    // matrix = room.costMatrixAvoidFlowers(matrix) || matrix
    return matrix
  }
  toString () {
    return this.memory.room
  }
}

function isObstacle(s){
  return !!~C.OBSTACLE_OBJECT_TYPES.indexOf(s.structureType) && (s.structureType !== C.STRUCTURE_RAMPART || s.my)
}
