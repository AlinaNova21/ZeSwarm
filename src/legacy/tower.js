class Tower {
  run(tower){
    let { room } = tower
    let hostiles = room.find(FIND_HOSTILE_CREEPS).filter(({ pos: { x, y } }) => x && x !== 49 && y && y !== 49)
    if (hostiles.length) {
      console.log('Hostiles!',hostiles.map(h=>`${h} ${h.owner.username}`))
      let closest = tower.pos.findClosestByRange(hostiles)
      tower.attack(closest)
    }
  }
}

module.exports = Tower
