// Types are provided by @types/screeps

interface ShardCache {
  raw: string
  data: any
}

const cache = new Map<string, ShardCache>()

const remote = new Proxy({}, {
  get(target: any, name: string | symbol): any {
    if (typeof name !== 'string') return
    return InterShardSegment.shardData(name)
  }
})

export default class InterShardSegment {
  static get local (): any {
    return InterShardSegment.shardData(Game.shard.name)
  }
  
  static get remote (): any {
    return remote
  }
  
  static shardData (shard: string = Game.shard.name): any {
    const local = shard === Game.shard.name
    const raw = (local ? InterShardMemory.getLocal() : InterShardMemory.getRemote(shard)) || '{}'
    if (cache.has(shard)) {
      const cached = cache.get(shard)!
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
  
  static commit (): void {
    const cached = cache.get(Game.shard.name)
    if (!cached) return
    cached.raw = JSON.stringify(cached.data)
    InterShardMemory.setLocal(cached.raw)
  }
}