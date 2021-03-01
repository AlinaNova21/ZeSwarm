export default class SafeObject {
  constructor (id) {
    return new Proxy({ id }, {
      get (target, name) {
        if (name === 'safe') return () => this
        return Game.getObjectById(target.id)[name]
      },
      getPrototypeOf (target) {
        return Object.getPrototypeOf(Game.getObjectById(target.id) || {})
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