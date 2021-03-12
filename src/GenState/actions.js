import SafeObject from '../lib/SafeObject'
import { Traveler } from '../Traveler'
import { resolveTarget } from './common'

export const creepActions = {}
export const genStates = {}

export const attack = wrap('attack')
export const rangedAttack = wrap('rangedAttack')
export const dismantle = wrap('dismantle')
export const heal = wrap('heal')
export const upgradeController = wrap('upgradeController')
export const claimController = wrap('claimController')
export const reserveController = wrap('reserveController')
export const attackController = wrap('attackController')
export const signController = wrap('signController')
export const moveTo = wrap('moveTo')
export const build = wrap('build')
export const harvest = wrap('harvest')
export const repair = wrap('repair')
export const pickup = wrap('pickup')
export const withdraw = wrap('withdraw')
export const transfer = wrap('transfer')

function wrap (funcName) {
  return function* (creep, ...args) {
    const ret = creep[funcName].apply(creep, args)
    yield
    return ret
  }
}

export function * travelTo (creep, dest, opts = {}) {
  const ret = Traveler.travelTo(creep, dest, opts) 
  yield
  return ret
}

export function * moveNear (creep, target, opts = {}) {
  if (typeof opts.roomCallback === 'string') {
    opts.roomCallback = new Function(opts.roomCallback)
  }
  opts.returnData = opts.returnData || {}
  const tgt = resolveTarget(target)
  if (!tgt) return  
  while (isValidTgt(tgt) && !creep.pos.isNearTo(tgt)) {    
    yield * travelTo(creep, tgt, opts)
    if (opts.returnData.pathfinderReturn && opts.returnData.pathfinderReturn.incomplete) {
      return
    }
  }
}

export function * moveInRange (creep, target, range, opts = {}) {
  const tgt = resolveTarget(target)
  while (isValidTgt(tgt) && !creep.pos.inRangeTo(tgt, range)) {
    yield * travelTo(creep, tgt, opts)
  }
}

export function* moveToRoom(creep, target, opts = {}) {
  let [x, y] = [25, 25]
  if (typeof target === 'string' && target.match(/^[EW]\d+[NS]\d+$/)) {
    target = { x, y, roomName: target }
  }
  const terrain = Game.map.getRoomTerrain(target.roomName)
  if (terrain.get(target.x, target.y) !== 0) {
    while (terrain.get(x, y) !== 0) {
      x = Math.floor(Math.random() * 20) + 15
      y = Math.floor(Math.random() * 20) + 15
    }
    target.x = x
    target.y = y
  }
  const tgt = resolveTarget(target)
  while (isValidTgt(tgt) && creep.pos.roomName !== tgt.roomName) {
    yield * travelTo(creep, tgt, opts)
  }
}

export function isValidTgt(tgt) {
  return tgt && (tgt instanceof SafeObject ? tgt.valid : true)
}