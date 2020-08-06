
const ALLIES_DEFAULT = []
const ALLOW_PASSAGE_DEFAULT = []
const RAIDS_DEFAULT = {
  enabled: false
}

const shards = {
  shard0: {
    sellExcessPixels: true
  },
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

const {
  [Game.shard.name]: {
    sellExcessPixels = false,
    allies = ALLIES_DEFAULT,
    allowPassage = ALLOW_PASSAGE_DEFAULT,
    raids = RAIDS_DEFAULT
  } = {}
} = shards

export default { sellExcessPixels, allies, allowPassage, raids }