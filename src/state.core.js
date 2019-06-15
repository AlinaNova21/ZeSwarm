module.exports = {
  runStack () {
    if (typeof this.stack[0] === 'string') this.creep.memory.stack = [this.stack]
    let [[name, ...args]=[]] = this.stack.slice(-1) || []
    this.log.debug(() => `runStack: ${name}`)
    let func = this[name]
    if (func) {
      func.apply(this, args)
    } else {
      this.log.error(`Invalid state ${name}`)
    }
  },
  push (...arg) {
    this.stack.push(arg)
  },
  pop () {
    this.stack.pop()
  },
  noop () {
    this.pop()
  },
  idle (say = 'Idling') {
    this.say(say)
  },
  sleep (until = 0) {
    if (Game.time >= until) {
      this.pop()
      this.runStack()
    }
  },
  loop (states, count = 1) {
    this.pop()
    if (--count > 0) {
      this.push('loop', states, count)
    }
    eachRight(states, state => this.push(...state))
    this.runStack()
  },
  repeat (count, ...state) {
    this.pop()
    if (count > 0) {
      this.push('repeat', --count, ...state)
    }
    this.push(...state)
    this.runStack()
  },
  resolveTarget (tgt) {
    if (typeof tgt === 'string') {
      return Game.getObjectById(tgt)
    }
    if (tgt.roomName && !(tgt instanceof RoomPosition)) {
      return new RoomPosition(tgt.x, tgt.y, tgt.roomName || tgt.room)
    }
    return tgt
  }
}