import core from './core'
import base from './base'
import movement from './movement'
import harvester from './harvester'
import claimer from './claimer'
import collector from './collector'
import feeder from './feeder'
import builder from './builder'
import scout from './scout'

let parts = [
  core,
  base,
  movement,
  harvester,
  claimer,
  collector,
  feeder,
  builder,
  scout
]

export default class states {}

parts.forEach(part => {
  for (let k in part) {
    Object.defineProperty(states.prototype, k, { value: part[k] })
  }
})
