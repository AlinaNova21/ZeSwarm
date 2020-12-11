export default class SafeObject {
  constructor (id) {
    return new Proxy({ 
      id,
      tick: Game.time, 
      object: Game.getObjectById(id)
    }, {
      get (target, name) {
        if (name === 'safe') return () => this
        if (target.tick !== Game.time) {
          target.object = Game.getObjectById(id)
        }
        if (name === 'direct') return () => target.object
        return target.object[name]
      },
      getPrototypeOf (target) {
        if (target.tick !== Game.time) {
          target.object = Game.getObjectById(id)
        }
        return Object.getPrototypeOf(target.object)
      }
    })
  }
  static attachPrototype() {
    RoomObject.prototype.safe = function () {
      return new SafeObject(this.id)
    }
    Room.prototype.safeFind = function (...args) {
      return this.find(...args).map(o => new SafeObject(o.id))
    }
  }
}