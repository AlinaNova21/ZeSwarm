const cache = new Map()

const remote = new Proxy({}, {
  get(target, name) {
    return InterShardSegment.shardData(name)
  }
})
export default class InterShardSegment {
  static get local () {
    return InterShardSegment.shardData(Game.shard.name)
  }
  static get remote () {
    return remote
  }
  static shardData (shard = Game.shard.name) {
    const local = shard === Game.shard.name
    const raw = (local ? InterShardMemory.getLocal() : InterShardMemory.getRemote(shard)) || '{}'
    if (cache.has(shard)) {
      const cached = cache.get(shard)
      if (cached.raw !== raw) {
        cached.raw = raw
        cached.data = JSON.parse(cached.raw)
      }
      return cached.data
    }
    const data = JSON.parse(raw)
    cache.set(shard, { raw, data })
    return data
  }
  static commit () {
    const cached = cache.get(Game.shard.name)
    if (!cached) return
    cached.raw = JSON.stringify(cached.data)
    InterShardMemory.setLocal(cached.raw)
  }
}