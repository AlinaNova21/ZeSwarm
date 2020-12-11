const shards = {
  default: {
    name: 'noop',
    gclLimit: 1,
    kernel: {
      enabled: true
    }
  },
  shard0: {
    name: 'zeswarm',
    gclLimit: 6
  },
  shard1: {
    name: 'bonzai',
    gclLimit: 4,
    kernel: {
      enabled: true
    }
  },
  shard2: {
    name: 'overmind',
    gclLimit: 4,
    kernel: {
      enabled: true
    }
  },
  shard3: {
    name: 'zeswarm',
    gclLimit: 4,
    kernel: {
      // enabled: true
    }
  }
}
const config = shards[Game.shard.name] || shards.default
export default config