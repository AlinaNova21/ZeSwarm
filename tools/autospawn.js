const { ScreepsAPI } = require('screeps-api')
const axios = require('axios')
const util = require('util')

const sleep = util.promisify(setTimeout)

async function cli (expr) {
  const { data } = await axios.post('http://localhost:21026/cli', expr)
  // console.log('cli resp', data)
  return typeof data === 'string' && data[0] === '{' ? JSON.parse(data) : data
}

async function run () {
  if (process.argv.length < 5) {
    console.log('server, shard, and room arguments required')
    process.exit(1)
  }

  const config = {
    server: process.argv[2],
    shard: process.argv[3],
    room: process.argv[4],
  }

  const api = await ScreepsAPI.fromConfig(config.server)
  const { terrain: [ terrain ] } = await api.raw.game.roomTerrain(config.room, 1, config.shard)  
  const { objects } = await api.raw.game.roomObjects(config.room, config.shard)
  terrain.room = 'W1N1'
  objects.forEach(o => o.room = 'W1N1')
  const opts = { terrain, objects }
  while(true) {
    try {
      await axios.get('http://localhost:21026/greeting')
      break
    } catch (e) {
      console.log('Waiting for CLI...')
      await sleep(1000)
    }
  }
  const result = await cli('(' + async function ({ terrain, objects }) {
    const blankTerrain = '1'.repeat(2500)
    const { db, env } = storage
    const blankRoom = async room => {
      await db.rooms.insert({ _id: room, room, status: 'out of borders' })
      await db['rooms.terrain'].insert({ room, terrain: blankTerrain, type: 'terrain' })
    }
    await system.pauseSimulation()
    await db.rooms.removeWhere({})
    await db['rooms.terrain'].removeWhere({})
    await db['rooms.objects'].removeWhere({})
    await Promise.all(['W0N0','W1N0','W2N0','W0N2','W1N2','W2N2','W0N1','W2N1'].map(blankRoom))
    await db.rooms.insert({ _id: 'W1N1', room: 'W1N1', status: 'normal' })
    await db['rooms.terrain'].insert(terrain)
    await Promise.all(objects.map(o => db['rooms.objects'].insert(o)))
    await bots.removeUser('bot').catch(() => {})
    await bots.spawn('bot', 'W1N1', { username: 'bot', auto: true })
    await db.users.update({ username: 'bot' }, { $set: { active: 10000 } })
    await setPassword('bot', 'bot')
    await map.updateTerrainData()
    await env.set('gameTime', 99)
    await system.resumeSimulation()
    return ''
  } + `)(${JSON.stringify(opts)})`)
  if (result) console.log(result)
  while (true) {
    const spawn = await cli('storage.db["rooms.objects"].findOne({ $or: [{ type: "spawn" }, { type: "constructionSite", structureType: "spawn" }] }).then(o => JSON.stringify(o))')
    if (spawn) {
      console.log(`Spawn location: ${spawn.x}, ${spawn.y}`)
      break
    }
    console.log('Waiting for spawn...')
    await sleep(1000)
  }
  process.exit(0)
}

run().catch(console.error)
