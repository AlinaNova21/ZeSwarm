export default class SafeObject {
  constructor (id) {
    return new Proxy({ 
      id,
      tick: Game.time, 
      object: getObjectById(id)
    }, {
      get (target, name) {
        if (name === 'safe') return () => this
        if (target.tick !== Game.time) {
          target.object = getObjectById(id)
        }
        return target.object[name]
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