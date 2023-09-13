/**
 * Tick safe wrapper around GameObjects
*/
interface SafeObjectConstructor {
  <T extends _HasId>(id: Id<T>): void
  new <T extends _HasId>(id: Id<T>): SafeObject<T>
  find: <K extends FindConstant, T extends _HasId>(room: Room, type: K, opts?: FilterOptions<K>) => SafeObject<T>[]
  attachPrototype: () => void
}

type SafeObject<T> = { valid: boolean } & T

const SafeObject = (function(){
  function SafeObject<T extends _HasId>(id: Id<T>) {
    const proxy = new Proxy({}, {
      get (target, name) {
        if (name === 'safe') return () => proxy
        if (name === 'valid') return !!Game.getObjectById(id)
        return Game.getObjectById(id)[name]
      },
      getPrototypeOf (target) {
        return Object.getPrototypeOf(Game.getObjectById(id) || {})
      }
    })
    return proxy as SafeObject<T>
  }
  return SafeObject as SafeObjectConstructor
})()

SafeObject.find = function find<K extends FindConstant, T extends _HasId = Structure>(room: Room, type: K, opts ?: FilterOptions<K>): SafeObject<T>[] {
  return room.find(type, opts).map(o => new SafeObject((o as any).id))
}

SafeObject.attachPrototype = function attachPrototype() {
  /**
   * @deprecated
   */
  // @ts-ignore
  RoomObject.prototype.safe = function safe() {
    // @ts-ignore
    return new SafeObject(this.id)
  }
  /**
   * @deprecated
   */
  // @ts-ignore
  Room.prototype.safeFind = function safeFind<K extends FindConstant, T extends _HasId = Structure>(type: K, opts?: FilterOptions<K>): SafeObject<T>[] {
    return SafeObject.find(this, type, opts)
  }
}

export default SafeObject

// export class SafeObject_<T extends RoomObject> {
//   valid: boolean
//   constructor (id: Id<T>) {
//     const proxy = new Proxy({}, {
//       get (target, name) {
//         if (name === 'safe') return () => proxy
//         if (name === 'valid') return !!Game.getObjectById(id)
//         return Game.getObjectById(id)[name]
//       },
//       getPrototypeOf (target) {
//         return Object.getPrototypeOf(Game.getObjectById(id) || {})
//       }
//     })
//     return proxy as { valid: boolean } & T
//   }
  
//   // @ts-ignore
//   static find<K extends FindConstant>(room: Room, type: K, opts?: FilterOptions<K>): SafeObject<FindTypes[K]>[] {
//     // @ts-ignore
//     return room.find(type, opts).map(o => new SafeObject(o.id))
//   }

//   static attachPrototype() {
//     /**
//      * @deprecated
//      */
//     // @ts-ignore
//     RoomObject.prototype.safe = function safe () {
//       // @ts-ignore
//       return new SafeObject(this.id)
//     }
//     /**
//      * @deprecated
//      */
//     // @ts-ignore
//     Room.prototype.safeFind = function safeFind<K extends FindConstant> (type: K, opts?: FilterOptions<K>): SafeObject<FindTypes[K]> {
//       const room: Room = this
//       // @ts-ignore
//       return room.find(type, opts).map(o => new SafeObject(o.id))
//     }
//   }
// }