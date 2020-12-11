const { ScreepsAPI } = require('screeps-api')
const chalk = require('chalk')
const fs = require('fs')

runConsole({
  server: process.argv[2],
  shard: process.argv[3],
}).catch(console.error)

async function runConsole (config) {
  const api = await ScreepsAPI.fromConfig(config.server)
  const str = fs.createWriteStream(`console.${config.server}.log`)
  await api.socket.connect()
  api.socket.on('console', e => {
    const { data: { shard, messages: { log: logs = [], results = [] } = {}, error = '' } } = e
    if (shard && config.shard && config.shard !== shard) return
    console.log(`==== ${shard || config.server} =====`)
    for (const log of logs) {
      if (log.startsWith('STATS;')) continue
      console.log(colorize(log))
      str.write(log + '\n')
    }
    for (const line of results) {
      console.log(line)
      str.write(line + '\n')
    }
    if (error) {
      console.log(error)
      str.write(error + '\n')
    }
  })
  api.socket.subscribe('console')
}

// async function sleep (ms) {
//   return new Promise(resolve => setTimeout(resolve, ms))
// }

function colorize (text) {
  const [, tag, style] = text.match(/<([\w-]+) .*?(?:color|style)="(.+?)".*?>/) || []
  if (!tag) return text
  const raw = text.replace(/<.+?>/g, '')
  const styles = style.split(';').map(s => s.split(':').map(v => v.trim()))
  let fn = chalk
  for (const [name, value] of styles) {
    if (!value) continue
    if (name === 'color') {
      if (value.startsWith('#')) {
        fn = chalk.hex(value)
      } else {
        fn = chalk.keyword(value)
      }
    }
    if (name === 'background-color') {
      if (value.startsWith('#')) {
        fn = chalk.bgHex(value)
      } else {
        fn = chalk.bgKeyword(value)
      }
    }
  }
  return fn(raw)
}
