import C from '../zos/constants.js'
export default C

C.addSegment('SPAWN')
C.addSegment('INTEL')

C.EPosisSpawnStatus = {
  ERROR: -1,
  QUEUED: 0,
  SPAWNING: 1,
  SPAWNED: 2
}

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
