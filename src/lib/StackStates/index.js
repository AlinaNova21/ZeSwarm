import core from './core'
import base from './base'
import movement from './movement'
import harvester from './harvester'
import claimer from './claimer'
import collector from './collector'
import feeder from './feeder'

let parts = [
  core,
  base,
  movement,
  harvester,
  claimer,
  collector,
  feeder
]

export default class states {}

parts.forEach(part => {
  for (let k in part) {
    Object.defineProperty(states.prototype, k, { value: part[k] })
  }
})
