
/**
 * @typedef {Object} RaidConfig
 * @property {boolean} enabled
 */

/**
 * @typedef {Object} ShardConfig
 * @property {boolean} sellExcessPixels
 * @property {string[]} allies
 * @property {string[]} allowPassage
 * @property {string[]} noSign
 * @property {RaidConfig} raids
 * @property {Object} extraConfig
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
    allies: ['psy372', 'modus', 'gt500'],
    noSign: ['psy372', 'modus'],
    expansion: false,
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