const roles = {}
class Creep {
  run (creep) {
    let role = creep.memory.role || 'scout'
    let rolec = this.tryLoadRole(role)
    if (rolec) {
      let start = Game.cpu.getUsed()
      try {
        rolec.run(creep)
      } catch (e) {
        console.log(`Creep ${creep.name} Error: ${e.stack}`)
      }
      let end = Game.cpu.getUsed()
      creep.room.visual.text(Math.round((end - start) * 100) / 100, creep.pos.x + 1, creep.pos.y, { size: 0.6 })
    } else {
      console.log(`Missing role: ${role}`)
    }
  }
  tryLoadRole (role) {
    if (roles[role]) return roles[role]
    try {
      let Cl = require(role)
      roles[role] = new Cl()
      return roles[role]
    } catch (e) {
      console.log(`Could not load role ${role}`)
    }
  }
}

module.exports = Creep
