import generic from './generic'
import overmind from './overmind'
import InterShardSegment from '../../InterShardSegment'

const shards = _.reduce(Game.cpu.shardLimits, (ret, shard, limit) => {
  if(limit) {
    ret.push(shard)
  }
  return ret
}, [])

const loaders = {
  generic,
  overmind,
  *zeswarm() {
    const code = require('zeswarm')
    console.log('ZeSwarm main loaded')
    while (true) {
      console.log('ZeSwarm main loop')
      code.loop()
      yield
    }
  },
  *noop() {
    while(true) yield
  },
  *fallback() {
    while(true) {
      console.log(`Multi Shard config error! Shard '${Game.shard.name}' could not be loaded and no default defined`) 
      yield
    }
  }
}

const plugins = {
  InterShardSegment: {
    preLoop () {
      const sd = InterShardSegment.local
      sd.rooms = _.size(Game.rooms)
      sd.spawns = _.size(Game.spawns)
    },
    postLoop () {
      InterShardSegment.commit()
    }
  }
}

export default function Loader ({ name, kernel = {}, plugins: enabledPlugins = [] }) {
  console.log('Loader', name, kernel, enabledPlugins)
  if(!loaders[name]) {
    loaders[name] = function* () {
      const { loop } = require(name)
      while(true) yield loop()
    }
  }
  if (kernel.enabled) {
    if (!enabledPlugins.includes('InterShardSegment')) {
      enabledPlugins.push('InterShardSegment')
    }
  }
  const loader = loaders[name]
  const code = require(name)
  return {
    run: loader(),
    loop() {
      for (const p of enabledPlugins) {
        if (!plugins[p]) continue
        plugins[p].preLoop()
      }
      code.loop()
      // try {
      //   const { done } = this.run.next()
      //   if (done) {
      //     this.run = loader()
      //   }
      // } catch(e) {
      //   this.run = loader()
      // }
      for (const p of enabledPlugins) {
        if (!plugins[p]) continue
        plugins[p].postLoop()
      }
    }
  }
}