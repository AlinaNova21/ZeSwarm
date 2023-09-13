
type StackEntry = [string, ...any]
export interface WorkingTarget {
  pos: RoomPosition
  range: number
  priority: number
}

export interface IntelMemory {
  rooms: {
    [roomName: string]: IntelRoomRecord
  } 
}

export interface IntelRoomRecord {
  ts: number
  name: string
  level?: number
  hostile?: boolean
  owner?: string
  reserver?: string
  spawns?: number
  towers?: number
  drained?: boolean
  walls?: number
  ramparts?: number
  creeps?: IntelCreep[]
  safemode?: number
  controller?: IntelRoomObject<StructureController>
  sources?: IntelRoomObject<Source>[]
  mineral?: MineralConstant
  v: number
  invaderCore?: IntelInvaderCore
}

export interface IntelRoomObject<T extends _HasId> {
  id: Id<T>
  pos: [x: number, y: number]
}

export interface IntelCreep extends IntelRoomObject<Creep> {
  body: {
    [type in BodyPartConstant]?: number
  }
  hits: number
  username: string
}

export interface IntelInvaderCore extends IntelRoomObject<StructureInvaderCore> {
  level: number
}

export interface PathingMoveOpts extends MoveToOpts {
  offRoads?: boolean
  findRoute?: boolean
  routeCallback?: (roomName: string) => number
  avoidRooms?: string[]
  priority?: number
}

type SegmentStore<T=any> = {
  [segment: string]: T
}

export interface MemoryManagerMemory {
  lru?: {
    [key: string]: number
  }
  pendingSaves?: SegmentStore<string | object>
  versions?: SegmentStore<number>
  active?: number[]
  readable?: SegmentStore
}

export { }
declare global {

  interface Memory {
    intel: IntelMemory
    __segments: MemoryManagerMemory
  }

  interface RoomMemory {
    _walls?: number[]
    _wallsTS?: number
    avoid?: boolean
  }

  interface CreepMemory {
    run?: string,
    role?: string,
    stack?: StackEntry[]
    homeRoom?: string
    _t?: {
      pos: [number, number, string]
      range: number
      priority: number
    }
  }

  interface CostMatrix {
    _bits: ArrayBuffer
    setFast(x: number, y: number, value: number): void
  }

  interface Creep {
    clearWorkingTarget: () => void
    moveToRoom: (room: string) => void
    moveOffRoad: (target: any, defaultOptions?: PathingMoveOpts) => void
    originalMoveTo: Creep["moveTo"]
    travelTo: (target: any, defaultOptions?: MoveToOpts) => void
  }

  interface PowerCreep {
    clearWorkingTarget: () => void
    moveToRoom: (room: string) => void
    originalMoveTo: Creep["moveTo"]
    travelTo: (target: any, defaultOptions?: MoveToOpts) => void
  }
      
  interface RoomMemory {
    donor?: string
  }

  interface RoomObject {
    safe<T>(): T
    valid?: boolean
  }

  type GeneratorThreadFn = (creepName: string) => Generator<void, boolean | void, void>
  
  interface Room {
    [STRUCTURE_OBSERVER]: StructureObserver
    [STRUCTURE_POWER_BANK]: StructurePowerBank
    [STRUCTURE_POWER_SPAWN]: StructurePowerSpawn
    [STRUCTURE_EXTRACTOR]: StructureExtractor
    [STRUCTURE_NUKER]: StructureNuker
    ['spawns']: StructureSpawn[]
    ['roads']: StructureRoad[]
    ['extensions']: StructureExtension[]
    ['constructedWalls']: StructureWall[]
    ['keeperLairs']: StructureKeeperLair[]
    ['ramparts']: StructureRampart[]
    ['portals']: StructurePortal[]
    ['links']: StructureLink[]
    ['labs']: StructureLab[]
    ['towers']: StructureTower[]
    ['containers']: StructureContainer[]
  }
}

