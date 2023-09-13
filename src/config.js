
/**
 * @typedef {Object} RaidConfig
 * @property {boolean} enabled
 */

/**
 * @typedef {Object} ShardConfig
 * @property {boolean} [sellExcessPixels]
 * @property {string[]} [allies]
 * @property {string[]} [allowPassage]
 * @property {string[]} [noSign]
 * @property {RaidConfig} [raids]
 * @property {Object} [extraConfig]
 * @property {boolean} [expansion]
 */

/** @type {string[]} */ 
const ALLIES_DEFAULT = []
/** @type {string[]} */ 
const ALLOW_PASSAGE_DEFAULT = []
/** @type {RaidConfig} */ 
const RAIDS_DEFAULT = {
  enabled: false
}
/** @type {string[]} */ 
const NO_SIGN_DEFAULT = []

/**
 * @type {Object<string,ShardConfig>}
 */
const shards = {
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

module.exports = { sellExcessPixels, allies, allowPassage, noSign, raids, extraConfig }