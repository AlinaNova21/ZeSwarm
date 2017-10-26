class Tower {
  run(tower){
    let { room } = tower
    let hostiles = room.find(FIND_HOSTILE_CREEPS)
    if (hostiles.length) {
      console.log('Hostiles!',hostiles.map(h=>`${h} ${h.owner.username}`))
      let closest = tower.pos.findClosestByRange(hostiles)
      tower.attack(closest)
    }
  }
}

module.exports = Tower