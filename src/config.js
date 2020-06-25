
const ALLIES_DEFAULT = []
const ALLOW_PASSAGE_DEFAULT = []
const RAIDS_DEFAULT = {
  enabled: false
}

const shards = {
  screepsplus1: {
    allies: [],
    allowPassage: ['Saruss'],
  },
  screepsplus2: {
    allies: [],
    allowPassage: [],
  },
  botarena: {
    raids: {
      enabled: true
    }
  }
}

export const { 
  [Game.shard.name]: {
    allies = ALLIES_DEFAULT,
    allowPassage = ALLOW_PASSAGE_DEFAULT,
    raids = RAIDS_DEFAULT
  } = {}
} = shards