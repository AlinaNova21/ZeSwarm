const fs = require('fs').promises
const path = require('path')
const { ScreepsAPI } = require('screeps-api')

if (process.argv.length < 3) {
  console.log('server argument required')
  process.exit(0)
}

const { version } = require('../package.json')

const config = {
  server: process.argv[2],
  room: process.argv[3]
}

// const BRANCH = 'ZeSwarm_v1.1'
const BRANCH = 'default'
ScreepsAPI.fromConfig(config.server).then(async api => {
  const ret = await api.raw.user.badge({ type: 24, color1: '#ff0000', color2: '#ffb400', color3: '#ff6a27', param: 0, flip: false })
  if (ret.ok) console.log('Badge Set')
  const modules = {}
  const ps = []
  // const files = (await fs.readdir('src')).map(f => `src/${f}`)
  // for (const file of files) {
  //   ps.push((async (file) => {
  //     const { name, ext } = path.parse(file)
  //     const data = await fs.readFile(file)
  //     if (ext === '.js') {
  //       modules[name] = data.toString('utf8')
  //     }
  //     if (ext === '.wasm') {
  //       modules[name] = { binary: data.toString('base64') }
  //     }
  //   })(file))
  // }
  // await Promise.all(ps)
  const resp = await api.raw.user.cloneBranch('', BRANCH, modules)
  // console.log(resp)
  const { list: branches } = await api.raw.user.branches()
  // console.log(branches)
  const branch = branches.find(b => b.branch === BRANCH) || {}
  if (!branch.activeWorld) {
    await api.raw.user.setActiveBranch(BRANCH, 'activeWorld')
    console.log(`Active branch set to ${BRANCH}`)
  }

  // console.log('Code Pushed')
  const { status } = await api.raw.user.worldStatus()
  // const rooms = [['E4S7', 30, 35]]
  if (config.room && status === 'empty') {
    while (true) {
      try {
        console.log(`Not Spawned, attempting to spawn in ${config.room}...`)
        const ret = await api.raw.game.placeSpawn(config.room, 25, 25, 'auto')
        if (ret.ok) {
          console.log('Placed Spawn')
          break
        } else {
          console.log('Error placing spawn:', ret.error)
        }
      } catch (err) {
        console.log('Error placing spawn:', err)
      }
      await sleep(10000)
    }
  }
  console.log(`ZeSwarm v${version} ready.`)
})

async function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
