const modes = require('creepMode')

class Cart {
  run (creep) {
    if (['deposit','withdraw'].indexOf(creep.memory.mode) == -1) {
	creep.memory.mode = 'withdraw'
    }
    modes.run(creep, 'deposit', 'withdraw', false)
  }
}
module.exports = Cart
