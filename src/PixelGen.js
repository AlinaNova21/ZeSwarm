import { kernel, restartThread } from './kernel'
import config from './config'

if (Game.cpu.generatePixel) {
  kernel.createProcess('PixelGen', restartThread, PixelGen)
}

function * PixelGen () {
  while (true) {
    if (Game.cpu.bucket === 10000) {
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