import SafeObject from "../lib/SafeObject"
import { Logger } from "../log"

export const log = new Logger('[GenState] ')

export interface RoomPositionRef {
  roomName: string
  x: number
  y: number
}

export function isRoomPositionRef(object: any): object is RoomPositionRef {
  return 'roomName' in object && !(object instanceof RoomPosition)
}

export type TargetRef<T extends _HasId> = Id<T> | RoomPositionRef | RoomPosition | SafeObject<T>

export function resolveTarget<T extends _HasId = Structure>(tgt: TargetRef<T>): TargetRef<T> | false {
  if (!tgt) return tgt
  if (typeof tgt === 'string') {
    return new SafeObject(tgt as Id<T>)
  }
  if (isRoomPositionRef(tgt)) {
    return new RoomPosition(tgt.x, tgt.y, tgt.roomName)
  }
  if (tgt instanceof SafeObject) {
    if (!(tgt as SafeObject<T>).valid) return false
  }
  return tgt
}