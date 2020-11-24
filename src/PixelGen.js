import { kernel, restartThread } from './kernel'
import config from './config'

// Disable Pixel generation after Dec 7
// https://screeps.com/forum/topic/3099/game-cpu-generatepixel-change
const date = new Date()
if (Game.cpu.generatePixel && date.getFullYear() === 2020 && (date.getMonth() < 11 || date.getDate() < 7)) {
  kernel.createProcess('PixelGen', restartThread, PixelGen)
}

function * PixelGen () {
  while (true) {
    if (Game.cpu.bucket >= 9000) {
      Game.cpu.generatePixel()
    }
    if (config.sellExcessPixels) {
      yield * SellExcess()
    }
    yield
  }
}

function * SellExcess () {
  if (Game.resources.pixel > 2000) {
    const orders = _.sortBy(Game.market.getAllOrders({ resourceType: PIXEL, type: ORDER_BUY }), 'price')
    const order = orders.pop()
    if (order) {
      Game.market.deal(order.id, Math.min(order.amount, 100), '')
    }
  }
}