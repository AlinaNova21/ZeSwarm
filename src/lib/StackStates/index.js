import scout from './scout'
import protector from './protector'
import upgrader from './upgrader'
import builder from './builder'
import feeder from './feeder'
import collector from './collector'
import claimer from './claimer'
import harvester from './harvester'
import movement from './movement'
import base from './base'
import core from './core'

let parts = [
  core,
  base,
  movement,
  harvester,
  claimer,
  collector,
  feeder,
  protector,
  upgrader,
  builder,
  scout
]

export default class states {}

parts.forEach(part => {
  for (let k in part) {
    Object.defineProperty(states.prototype, k, { value: part[k] })
  }
})
