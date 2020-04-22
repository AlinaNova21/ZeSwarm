import { kernel, sleep, restartThread } from './kernel'
import { compose, multiply, divide, clamp } from 'ramda'
import { ReplaySubject } from 'rxjs'

kernel.createProcess('UI', restartThread, UIThread)

function * UIThread () {
  const threads = [
    ['visuals', UIVisuals]
  ]
  while (true) {
    for (const [key, fn] of threads) {
      if (!this.hasThread(key)) {
        this.createThread(key, fn)
      }
    }
    yield * sleep(10)
  }
}

function * UIVisuals () {
  const cpu = compose(Math.floor, clamp(0, 100), multiply(100), divide)
  while (true) {
    const vis = new RoomVisual()
    const used = Game.cpu.getUsed()
    this.log.info(bar(vis, 2, 3, 'CPU', cpu(used, Game.cpu.limit)))
    this.log.info(bar(vis, 2, 2, 'Bucket', cpu(Game.cpu.bucket, 10000)))
    yield
  }
}

function bar (vis, x, y, label, value) {
  if (value <= 1) value *= 100
  vis.rect(x, y, 4, 1, { fill: '#111111', stroke: '#FFFFFF' })
  vis.rect(x, y, 4 * (value / 100), 1, { fill: '#CCCCCC' })
  vis.text(`${value}%`, x + 3, y + 0.75)
  vis.text(label, x, y + 0.75, { align: 'left' })
  const len = Math.floor(value / 10)
  const bar = '='.repeat(len)
  const space = ' '.repeat(10 - len)
  const paddedLabel = (label + ' '.repeat(10)).slice(0, 10)
  return `${paddedLabel} [${bar}${space}] ${value}%`
}
