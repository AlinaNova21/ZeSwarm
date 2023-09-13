/*
: {
  USER?: string
  USERNAME?: string
  SEGMENTS?: {
    [key: string]: number
  }
  [key: string]: any
}
*/
const C = {}

const findStructOwner = () => {
  /** @type {AnyOwnedStructure} */
  // @ts-expect-error
  const s = Object.values(Game.structures).find(Boolean)// as AnyOwnedStructure
  return s && s.owner.username
}

C.USER = C.USERNAME = findStructOwner() || 'ZeSwarm'

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

C.C = C
module.exports = C
