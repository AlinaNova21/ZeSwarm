const { ScreepsAPI } = require('screeps-api')

const RARITY_TO_KEEP = 4
const PIXELS_TO_RESERVE = 0

async function run() {
  const api = await ScreepsAPI.fromConfig('main', 'main')
  while (true) {
    const { list: inventory } = await api.raw.user.decorations.inventory()
    const toRemove = inventory.filter(i => i.decoration.rarity < RARITY_TO_KEEP).map(i => i._id)
    if (toRemove.length >= 0) {
      await api.raw.user.decorations.convert(toRemove)
      const amountReturned = toRemove.length * 400
      console.log(`Converted ${toRemove.length} decorations to ${amountReturned} pixels`)
    }
    let { resources: { pixel: pixels } } = await api.raw.auth.me()
    console.log(`Pixels: ${pixels}`)
    pixels -= PIXELS_TO_RESERVE
    pixels = Math.max(0, pixels)
    const countToPixelize = Math.floor(pixels / 500)
    if (countToPixelize === 0) {
      console.log('Not enough pixels')
      break
    }
    console.log(`Pixelizing ${countToPixelize} for ${countToPixelize * 500} pixels`)
    await api.raw.user.decorations.pixelize(countToPixelize)
  }
}

run().catch(console.error)
