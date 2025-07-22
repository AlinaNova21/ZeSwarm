// Types are provided by @types/screeps

interface RaidConfig {
  enabled: boolean
}

interface ShardConfig {
  sellExcessPixels?: boolean
  allies?: string[]
  allowPassage?: string[]
  noSign?: string[]
  raids?: RaidConfig
  extraConfig?: Record<string, any>
  expansion?: boolean
}

const ALLIES_DEFAULT: string[] = []
const ALLOW_PASSAGE_DEFAULT: string[] = []
const RAIDS_DEFAULT: RaidConfig = {
  enabled: false
}
const NO_SIGN_DEFAULT: string[] = []

const shards: Record<string, ShardConfig> = {
  shardSeason: {
    allies: ['psy372'],
    noSign: ['psy372'],
    expansion: true,
  },
  screepsplus1: {
    allies: [],
    allowPassage: ['Saruss'],
    expansion: true,
  },
  screepsplus2: {
    allies: [],
    allowPassage: [],
    expansion: true,
  },
  botarena: {
    raids: {
      enabled: true
    },
    expansion: true,
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