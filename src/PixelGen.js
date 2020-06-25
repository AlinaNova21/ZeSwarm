import { kernel } from '/kernel'

if (Game.cpu.generatePixel) {
  kernel.createProcess('PixelGen', PixelGen)
}

function * PixelGen () {
  while (true) {
    if (Game.cpu.bucket === 10000) {
      Game.cpu.generatePixel()
    }
    yield
  }
}