// Types are provided by @types/screeps

interface Constants {
  USER: string
  USERNAME: string
  SEGMENTS: {
    [key: string]: number
  }
  RECIPES: {
    [product: string]: [string, string]
  }
  C: Constants
  [key: string]: any
}

const C: Constants = {} as Constants

const findStructOwner = (): string | undefined => {
  const s = Object.values(Game.structures).find(Boolean) as AnyOwnedStructure
  return s?.owner?.username
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
export { C }
export default C
