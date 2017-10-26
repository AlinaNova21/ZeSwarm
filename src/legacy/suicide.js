const modes = require('./creepMode')

class Suicide {
  run (creep) {
    modes.run(creep, 'suicide')
  }
}
module.exports = Suicide
