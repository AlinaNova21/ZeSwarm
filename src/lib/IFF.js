import C from '/include/constants'
import intel from '/opt/StaticIntel'

let allied = {
  ags131: true,
  ZeSwarm: true
}

let friendly = {

}

export class IFF {
  static isFriend (user) {
    if (friendly[user]) return true
    if (IFF.isAlly(user)) return true
    const theirAlliance = intel.getUserAlliance(user)
    if (friendly[theirAlliance]) return true
    return false
  }
  static isFoe (user) {
    return !IFF.isFriend(user)
  }
  static isAlly (user) {
    if (allied[user]) return true
    const theirAlliance = intel.getUserAlliance(user)
    if (allied[theirAlliance]) return true
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