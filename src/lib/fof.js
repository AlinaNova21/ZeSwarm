import config from '../config'

/**
* @param {string|RoomObject} tgt
* @returns {boolean}
*/
export function isAlly(tgt) {
  if (typeof tgt !== 'string') {
    tgt = tgt.owner.username
  }
  return config.allies.includes(tgt.toLowerCase())
}