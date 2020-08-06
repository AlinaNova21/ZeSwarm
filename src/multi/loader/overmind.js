function getUsername() {
  const object = _.find(Game.creeps, c => c) || _.find(Game.spawns, s => s)
  return object && object.owner.username || ''
}

export default function* Overmind() {
  while (!_.find(Game.rooms, room => room.controller && room.controller.owner && room.controller.owner.username === getUsername())) {
    const flag = _.find(Game.flags, f => f.name.startsWith('bootstrap'))
    if(!flag) {
      console.log(`No bootstrap flag found, place a flag named 'bootstrap' in the target room to start`)
      yield
      continue
    }
    const targetRoom = flag.pos.roomName
    const claimer = _.find(Game.creeps, creep => creep.getActiveBodyparts(CLAIM))
    console.log(`Target Room: ${targetRoom}`)
    if (claimer) {
      console.log('claimer', claimer, claimer.pos)
      if (claimer.pos.roomName !== targetRoom) {
        console.log('claimer: Moving to target room')
        claimer.moveTo(new RoomPosition(25, 25, targetRoom))
        claimer.say(targetRoom)
      } else {
        const controller = claimer.room.controller
        if (claimer.pos.isNearTo(controller.pos)) {
          claimer.claimController(controller)
          claimer.signController(controller, 'Bootstraping')
          if (flag.name === 'bootstrap') {
            flag.remove()
          }
          claimer.room.createFlag(25, 25, `bootstrap:${targetRoom}`, COLOR_PURPLE, COLOR_GREY)
        } else {
          claimer.moveTo(controller.pos)
          claimer.say('Claiming...', true)
        }
      }
    }
    yield
  }
  const overmind = require('overmind')
  while (true) {
    const flag = _.find(Game.flags, f => f.name.startsWith('bootstrap'))
    if (flag) {
      _.each(Game.creeps, creep => {
        if(creep.name.startsWith('settler')) {
          creep.memory.colony = targetRoom
          if (!creep.memory.role && global[creep.name]) {
            console.log(`Reassigning ${creep.name}`)
            if (creep.body.length === 1) {
              global[creep.name].reassign(global[targetRoom].overlords.scout, 'scout')
            } else {
              global[creep.name].reassign(global.Overmind.directives[`bootstrap:${targetRoom}`].overlords.pioneer, 'pioneer')
            }
          }
        }
      })
    }
    overmind.loop()
    if (Game.time % 100 === 0 && !_.size(Game.spawns)) {
      Memory.rooms[targetRoom].expiration = 0
    }
    yield
  }
}