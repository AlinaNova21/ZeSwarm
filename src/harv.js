const modes = require('creepMode')

class Harv {
  run (creep) {
    modes.run(creep, 'deposit')
  }
}
module.exports = Harv
