import { kernel, restartThread } from './kernel'
import config from './config'
import sortBy from 'lodash/sortBy'

// Disable Pixel generation after Dec 10
// https://screeps.com/forum/topic/3099/game-cpu-generatepixel-change
const date = new Date(2020, 11, 10, 0, 0, 0, 0) // 12/10/2020 00:00:00
if (Game.cpu.generatePixel && Date.now() < date.getTime()) {
  kernel.createProcess('PixelGen', restartThread, PixelGen)
}

function * PixelGen (): Generator<void, void, void> {
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

function * SellExcess (): Generator<void, void, void> {
  if (Game.resources['pixel'] > 2000) {
    const orders = sortBy(Game.market.getAllOrders({ resourceType: 'pixel' as ResourceConstant, type: ORDER_BUY }), 'price')
    const order = orders.pop()
    if (order) {
      Game.market.deal(order.id, Math.min(order.amount, 100), '')
    }
  }
}