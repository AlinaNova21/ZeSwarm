import main from './main'

import creep from './creep'
import spawn from './spawn'
import controller from './controller'

let protoCache = {
  creep: new creep(),
  spawn: new spawn(),
  controller: new controller()
}

RoomObject.prototype.run = function(){
    if (this instanceof Creep) this.structureType = 'creep'
    if(protoCache[this.structureType] === false) return
    if(protoCache[this.structureType]) {
        protoCache[this.structureType].run(this)
    } else {
        try{
            let c = require(this.structureType)
            protoCache[this.structureType] = new c()
        }catch(e){
            console.log(`Could not find handler for ${this.structureType} ${e.stack}`)
            protoCache[this.structureType] = false
        }
    }
}

class Legacy {
  constructor (context) {
    this.context = context
  }
  run () {
    this.context.log.hook('warn')
    main.loop()
    this.context.log.unhook()
  }
}

export const bundle = {
  install (registry) {
    registry.register('legacy', Legacy)
  }
}
