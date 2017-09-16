const modes = require('creepMode')

class Build {
  run (creep) {
    modes.run(creep, 'build')
  }
}
module.exports = Build
