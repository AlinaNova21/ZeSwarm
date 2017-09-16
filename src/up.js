const modes = require('creepMode')

class Up {
  run (creep) {
    modes.run(creep, 'upgrade')
  }
}
module.exports = Up
