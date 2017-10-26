const modes = require('./creepMode')

class Drainer {
  run (creep) {
    modes.run(creep, 'drainer')
  }
}
module.exports = Drainer
