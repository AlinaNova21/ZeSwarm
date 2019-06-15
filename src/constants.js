const C = {}

C.USER = C.USERNAME = Game.spawns.Spawn1 && Game.spawns.Spawn1.owner.username || 'ZeSwarm'

// Import global constants
Object.keys(global)
  .filter(k => k === k.toUpperCase())
  .forEach(k => {
    C[k] = global[k]
  })

C.RECIPES = {}
for (var a in REACTIONS) {
  for (var b in C.REACTIONS[a]) {
    C.RECIPES[C.REACTIONS[a][b]] = [a, b]
  }
}

C.SEGMENTS = {
  INTEL: 2
}

module.exports = C