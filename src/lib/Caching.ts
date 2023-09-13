import log from "@/log"

export interface LRUCacheOpts<K, V> {
  limit?: number
  init?: CacheInitFunction<K, V>
}

export type CacheInitFunction<K, V> = (key: K) => V

export class LRUCache<K=string, V=any> {
  private cache = new Map<K, V>()
  private lru = new Map<K, number>()
  public limit: number
  public init: CacheInitFunction<K, V> | undefined
  constructor (opts: LRUCacheOpts<K,V> = {}) {
    const {
      limit = 100,
      init,
    } = opts
    this.limit = limit
    this.init = init
  }
  has (key: K): boolean {
    return this.cache.has(key)
  }
  get (key: K): V | undefined {
    let value = this.cache.get(key)
    if (!value) {
      this.trim()
      if (this.init) {
        const v = this.init(key)
        this.set(key, v)
        return v
      }
      return undefined
    }
    this.lru.set(key, Game.time)
    return value;
  }
  set (key: K, value: V) {
    this.cache.set(key, value)
    this.lru.set(key, Game.time)
  }
  trim () {
    while (this.cache.size > this.limit) {
      let oldest: K
      let minTime = Game.time
      for (const [room, time] of this.lru.entries()) {
        if (time < minTime) {
          oldest = room
          minTime = time
        }
      }
      log.info(`Removing ${oldest} from cache`)
      this.lru.delete(oldest)
      this.cache.delete(oldest)
    }
  }
}