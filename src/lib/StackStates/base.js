import C from '/include/constants'

export default {
  say (say, publ = false) {
    this.creep.say(say, publ)
    this.pop()
    this.runStack()
  },
  suicide () {
    this.creep.suicide()
    this.pop()
  },
  attack (target) {
    const tgt = this.resolveTarget(target)
    this.creep.attack(tgt)
    this.pop()
  },
  rangedAttack (target) {
    const tgt = this.resolveTarget(target)
    this.creep.rangedAttack(tgt)
    this.pop()
  },
  heal (target) {
    const tgt = this.resolveTarget(target)
    this.creep.heal(tgt)
    this.pop()
  },
  upgradeController (target) {
    const tgt = this.resolveTarget(target)
    this.creep.upgradeController(tgt)
    this.pop()
  },
  claimController (target) {
    const tgt = this.resolveTarget(target)
    this.creep.claimController(tgt)
    this.pop()
  },
  attackController (target) {
    const tgt = this.resolveTarget(target)
    this.creep.attackController(tgt)
    this.pop()
  },
  signController (target, msg) {
    const tgt = this.resolveTarget(target)
    this.creep.signController(tgt, msg)
    this.pop()
  },
  move (dir) {
    this.creep.move(dir)
    this.pop()
  },
  moveTo (target) {
    const tgt = this.resolveTarget(target)
    this.creep.moveTo(tgt)
    this.pop()
  },
  build (target) {
    const tgt = this.resolveTarget(target)
    this.creep.build(tgt)
    this.pop()
  },
  harvest (target) {
    const tgt = this.resolveTarget(target)
    this.creep.harvest(tgt)
    this.pop()
  },
  repair (target) {
    const tgt = this.resolveTarget(target)
    this.creep.repair(tgt)
    this.pop()
  },
  pickup (target) {
    let tgt = this.resolveTarget(target)
    this.creep.pickup(tgt)
    this.pop()
  },
  withdraw (target, res, amt) {
    let tgt = this.resolveTarget(target)
    this.creep.withdraw(tgt, res, amt)
    this.pop()
  },
  transfer (target, res, amt) {
    let tgt = this.resolveTarget(target)
    this.creep.transfer(tgt, res, amt)
    this.pop()
  }
}
