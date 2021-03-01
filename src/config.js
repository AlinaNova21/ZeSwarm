
const ALLIES_DEFAULT = []
const ALLOW_PASSAGE_DEFAULT = []
const RAIDS_DEFAULT = {
  enabled: false
}
const NO_SIGN_DEFAULT = []

const shards = {
  shardSeason: {
    allies: ['psy372', 'modus'],
    noSign: ['psy372', 'modus']
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
    noSign = NO_SIGN_DEFAULT,
    raids = RAIDS_DEFAULT,
    ...extraConfig
  } = {}
} = shards

export default { sellExcessPixels, allies, allowPassage, noSign, raids, extraConfig }