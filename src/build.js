const modes = require('creepMode')

class Build {
  run (creep) {
    modes.run(creep, 'build', 'withdraw')
  }
}
module.exports = Build
