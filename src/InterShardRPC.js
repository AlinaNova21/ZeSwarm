import InterShardSegment from './InterShardSegment'
import { kernel, sleep } from './kernel'

const WAIT_TIMEOUT = 20

const methods = new Map()

kernel.createProcess('InterShardRPC', InterShardRPCHandler)

export default class InterShardRPC {
  constructor (shard) {
    this.shard = shard
  }

  static expose(method, fn) {
    methods.set(method, fn)
  }

  * call (method, ...args) {
    const id = this.genID()
    const mem = getLocalMemory()
    mem.req[id] = [this.shard, method, args, Game.time]
    return yield * this.waitForResponse(id)
  }

  * waitForResponse (id) {
    const start = Game.time
    while (Game.time - start < WAIT_TIMEOUT) {
      const mem = getRemoteMemory(this.shard)
      const res = mem.res[id]
      if (res) {
        const mem = getLocalMemory()
        delete mem.req[id]
        if (res.error) {
          throw new Error(res.error)
        }
        return res.result
      }
      yield
    }
    throw new Error(`Timeout waiting for response ${id}`)
  }

  genID () {
    return ('R' + Game.time.toString(36).slice(-4) + Math.random().toString(26).slice(-4)).toUpperCase()
  }
}

function * InterShardRPCHandler () {
  if (!Game.cpu.shardLimits) {
    this.log.warn('shardLimits not available')
    return
  }
  // InterShardSegment.local.rpc = { req: {}, res: {} }
  InterShardRPC.expose('ping', function * ping () { return 'pong' })
  while (true) {
    if (!this.hasThread('handleRequests')) {
      this.createThread('handleRequests', handleRequests)
    }
    if (!this.hasThread('cleanup')) {
      this.createThread('cleanup', cleanup)
    }
    const shards = Object.keys(Game.cpu.shardLimits)
    for (const shard of shards) {
      if (shard === Game.shard.name) continue
      if (!this.hasThread(`ping:${shard}`)) {
        this.createThread(`ping:${shard}`, ping, shard)
      }
    }
    yield * sleep(20)
  }
}

function * ping (shard) {
  const rpc = new InterShardRPC(shard)
  this.log.info(`${Game.time} Pinging ${shard}`)
  const response = yield * rpc.call('ping')
  this.log.info(`${Game.time} Response from ${shard}: ${response}`)
}

function * handleRequests () {
  while (true) {
    const shards = Object.keys(Game.cpu.shardLimits)
    const mem = getLocalMemory()
    // this.log.info(`mem ${JSON.stringify(mem)}`)
    for (const shard of shards) {
      const rem = getRemoteMemory(shard)
      // this.log.info(`rem ${shard} ${JSON.stringify(rem)}`)
      for (const id in rem.req) {
        if (mem.res[id]) continue
        const [shard, method, args] = rem.req[id] || []
        if (shard !== Game.shard.name) continue
        if (!this.hasThread(`respond:${id}`)) {
          this.createThread(`respond:${id}`, respond, id, rem.req[id])
        }
      }
    }
    yield
  }
}

function * respond (id, [shard, method, args]) {
  try {
    const fn = methods.get(method)
    if (!fn) throw new Error(`Invalid Method: '${method}'`)
    const result = yield * fn.apply(this, args)
    const mem = getLocalMemory()
    mem.res[id] = { shard, result }
  } catch (e) {
    const error = e.message
    const mem = getLocalMemory()
    mem.res[id] = { shard, error }
  }
}

function * cleanup () {
  while (true) {
    const mem = getLocalMemory()
    for (const id in mem.res) {
      const res = mem.res[id]
      const rem = getRemoteMemory(res.shard)
      if (!rem.req[id]) {
        delete mem.res[id]
      }
    }
    for (const id in mem.req) {
      if (mem.req[id][3] + 30 < Game.time) {
        delete mem.req[id]
      }
    }
    yield * sleep(20)
  }
}


function getLocalMemory() {
  const mem = InterShardSegment.local
  mem.rpc = mem.rpc || { req: {}, res: {} }
  return mem.rpc
}

function getRemoteMemory(shard) {
  const mem = InterShardSegment.shardData(shard)
  mem.rpc = mem.rpc || { req: {}, res: {} }
  return mem.rpc
}
