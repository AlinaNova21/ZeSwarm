const roles = {}

Creep.prototype.run = function(){
  let role = this.memory.role || 'scout'
  let rolec = tryLoadRole(role)
  if(rolec) {
    let start = Game.cpu.getUsed()
    try{
      rolec.run(this)
    }catch(e){
      console.log(`Creep ${this.name} Error: ${e.stack}`)
    }
    let end = Game.cpu.getUsed()
    this.room.visual.text(Math.round((end-start)*100)/100, this.pos.x+1, this.pos.y, { size: 0.6 })
  } else {
    console.log(`Missing role: ${role}`)
  }
}

function tryLoadRole(role){
  if(roles[role]) return roles[role]
  try{
    let c = require(role)
    roles[role] = new c()
    return roles[role]
  }catch(e){
    console.log(`Could not load role ${role}`)
  }
}