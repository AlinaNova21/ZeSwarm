const fs = require('fs').promises
const path = require('path')
const { ScreepsAPI } = require('screeps-api')

const config1 = {
  server: 'local',
  rooms: [['E29S16', 26, 30]]
}
const config2 = {
  server: 'localhost',
  rooms: [['W8N3', 31, 16]]
}
const config3 = {
  server: 'botarena',
  rooms: [['E4S7', 30, 35]]
}
const config4 = {
  server: 'splus2',
  rooms: [['W8N8', 25, 25]]
}
const config5 = {
  server: 'pbrun',
  rooms: [
    ['W2N2', 20, 25],
    ['W8N3', 20, 25]
  ]
}
const config6 = {
  server: 'test',
  rooms: [['W5N2', 40, 20]]
}
const config7 = {
  server: 'pi',
  rooms: [
    ['W2N2', 20, 25],
    ['W8N3', 20, 25]
  ]
}
// const config = config1
// const config = config2
// const config = config3
// const config = config4
// const config = config5
const config = config6
// const config = config7
const BRANCH = 'ZeSwarm_v1.1'
// const BRANCH='default'
ScreepsAPI.fromConfig(config.server).then(async api => {
  const ret = await api.raw.user.badge({ "type": 24, "color1": "#ff0000", "color2": "#ffb400", "color3": "#ff6a27", "param": 0, "flip": false })
  if (ret.ok) console.log('Badge Set')
  const modules = {}
  const ps = []
  const files = (await fs.readdir('src')).map(f => `src/${f}`)
  for (const file of files) {
    ps.push((async (file) => {
      const { name, ext } = path.parse(file)
      const data = await fs.readFile(file)
      if (ext === '.js') {
        modules[name] = data.toString('utf8')
      }
      if (ext === '.wasm') {
        modules[name] = { binary: data.toString('base64') }
      }
    })(file))
  }
  await Promise.all(ps)
  const resp = await api.raw.user.cloneBranch('', BRANCH, modules)
  console.log(resp)
  const { list: branches } = await api.raw.user.branches()
  console.log(branches)
  const branch = branches.find(b => b.branch === BRANCH) || {}
  if (!branch.activeWorld) {
    await api.raw.user.setActiveBranch(BRANCH, 'activeWorld')
    console.log(`Active branch set to ${BRANCH}`)
  }
  
  console.log('Code Pushed')
  const { status } = await api.raw.user.worldStatus()
  // const rooms = [['E4S7', 30, 35]]
  if (status === 'empty') {
    while(true) {
      try {
        console.log('Not Spawned, attempting spawn from room list...')
        const ret = await api.raw.game.placeSpawn(...config.rooms[0], 'Spawn1')
        if (ret.ok) {
          console.log('Placed Spawn')
          break
        } else {
          console.log('Error placing spawn:', ret.error)
        }
      } catch(err) {
        console.log('Error placing spawn:', err)
      }
      await sleep(10000)
    }
  }
  console.log('ZeSwarm v1.1 ready.')
})

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}