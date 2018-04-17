import C from '/include/constants'
import intel from '/opt/StaticIntel'

const OFFICIAL = {
  allied: {
    ags131: true,
    ZeSwarm: true
  },
  friends: {
    CaptainMuscles: 
  }
}

const SHARD = {
  DEFAULT: {
    allied: {},
    friends: {}
  }
  shard0: OFFICIAL,
  shard1: OFFICIAL,
  shard2: OFFICIAL,
  screepsplus1: {
    allied: {},
    friends: {}
  }
}

const current = SHARD[Game.shard.name] || SHARD.DEFAULT

export class IFF {
  static isFriend (user) {
    if (current.friends[user]) return true
    if (IFF.isAlly(user)) return true
    const theirAlliance = intel.getUserAlliance(user)
    if (current.friends[theirAlliance]) return true
    return false
  }
  static isFoe (user) {
    return !IFF.isFriend(user)
  }
  static isAlly (user) {
    if (current.allied[user]) return true
    const theirAlliance = intel.getUserAlliance(user)
    if (current.allied[theirAlliance]) return true
    const myAlliance = intel.getUserAlliance(C.USER)
    if (myAlliance === theirAlliance) return true
    return false
  }
  static refresh () {
    // TODO: Use segment for server specific lists
    // TODO: Import LOAN segment if available
  }
  static notAlly({ owner: { username } = {}}) {
    return !IFF.isAlly(username)
  }

  static notFriend({ owner: { username } = {}}) {
    return !IFF.isFriend(username)
  }
}