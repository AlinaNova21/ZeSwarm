const C = {}

const findStructOwner = () => {
  const s = Object.values(Game.structures).find(Boolean)
  return s && s.owner.username
}

C.USER = C.USERNAME = (Game.spawns.Spawn1 && Game.spawns.Spawn1.owner.username) || findStructOwner() || 'ZeSwarm'

// Import global constants
Object.keys(global)
  .filter(k => k === k.toUpperCase())
  .forEach(k => {
    C[k] = global[k]
  })

C.RECIPES = {}
for (const a in REACTIONS) {
  for (const b in C.REACTIONS[a]) {
    C.RECIPES[C.REACTIONS[a][b]] = [a, b]
  }
}

C.SEGMENTS = {
  INTEL: 2
}

module.exports = C
