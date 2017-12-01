import C from '../zos/constants.js'
export default C

C.addSegment('SPAWN')

C.EPosisSpawnStatus = {
  ERROR: -1,
  QUEUED: 0,
  SPAWNING: 1,
  SPAWNED: 2
}

// Import global constants
console.log(JSON.stringify(C.SEGMENTS))

Object.keys(global)
  .filter(k => k === k.toUpperCase())
  .forEach(k => {
    console.log(k)
    C[k] = global[k]
  })
