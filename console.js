const { ScreepsAPI } = require('screeps-api')
const chalk = require('chalk')

const configs = [
  // { server: 'splus1' },
  // { server: 'splus2' },
  // { server: 'test' },
  { server: 'main', shard: 'shard3' }
]

configs.forEach(runConsole)
function runConsole (config) {
  ScreepsAPI.fromConfig(config.server).then(async api => {
    await api.socket.connect()
    api.socket.on('console', (e) => {
      const { data: { shard, messages: { log: logs = [] } = {}, error = '' } } = e
      if (config.shard && config.shard !== shard) return
      console.log(`==== ${shard || config.server} =====`)
      for (const log of logs) {
        if (log.startsWith('STATS;')) continue
        console.log(colorize(log))
      }
      if (error) {
        console.log(error)
      }
    })
    api.socket.subscribe('console')
  })
}

async function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function colorize (text) {
  const [, tag, style] = text.match(/<([\w-]+) .*?style="(.+?)".*?>/) || []
  if (!tag) return text
  const raw = text.replace(/<.+?>/g, '')
  const styles = style.split(';').map(s => s.split(':'))
  let fn = chalk
  for (const [name, value] of styles) {
    if (name == 'color') {
      fn = chalk.keyword(value.trim())
    }
    if (name == 'background-color') {
      fn = chalk.bgKeyword(value.trim())
    }
  }
  return fn(raw)
}
