import { kernel, restartThread, sleep } from './kernel'

const minBy = _.minBy
const map = _.map

const segments = new Map()
const activeSegments = new Set()

kernel.createProcess('MemoryManager', restartThread, memoryManager)

let log = null

class MemoryManager {
  get mem() {
    return this.memget()
  }

  get lru() {
    this.mem.lru = this.mem.lru || {}
    return this.mem.lru
  }

  constructor(memget) {
    this.memget = memget || (() => {
      Memory.__segments = Memory.__segments || {}
      return Memory.__segments
    })
    this.fixed = [0]
    this.segments = {}
    this.versions = {}
    this.pendingSaves = {}
    this.mem.pendingSaves = this.mem.pendingSaves || {}
    this.mem.versions = this.mem.versions || {}
    this.mem.active = this.mem.active || [0]
    this.mem.readable = this.mem.readable || {}
    this.mem.lru = this.mem.lru || {}
    if (this.mem.active.indexOf(0) === -1) this.mem.active.splice(0, 0, 0)
    this.config = this.getSegment(0)
    if (this.config) {
      if (this.config.named) {
        this.config.named.forEach((v, k) => {
          this.wrap(k, v)
          Object.defineProperty(this.segments, v, {
            get: () => this.getSegment(k),
            set: (v) => this.saveSegment(k, v)
          })
        })
      }
    }
  }

  activate(id) {
    if (!id && id !== 0) return
    if (this.mem.active.indexOf(id) === -1) {
      this.mem.active.push(id)
    }
    console.log(`MM: ${this.mem.active}`)
  }

  deactivate(id) {
    const ind = this.mem.active.indexOf(id)
    if (ind === -1) return
    this.mem.active.splice(ind, 1)
  }

  endOfTick() {
    try {
      while (this.mem.active.length > 10) {
        console.log(`MM: Active too long, pruning ${this.mem.active}`)
        const min = minBy(map(this.lru, (time, id) => ({ id, time })), 'time')
        const ind = min ? this.mem.active.indexOf(min.id) : -1
        if (ind !== -1) {
          delete this.lru[min.id]
          this.mem.active.splice(ind, 1)
        }
      }
      console.log()
      RawMemory.setActiveSegments(this.mem.active)
    } catch (e) {
      console.log(`ERROR: Failed to set active. Reseting Active List ${e.stack}`)
      this.mem.active = [0]
    }
    Object.keys(RawMemory.segments).filter(k => k < 80).forEach(k => delete RawMemory.segments[k])
    let rem = 10 - Object.keys(RawMemory.segments).length
    _.each(this.mem.pendingSaves, (v, id) => {
      if (rem--) {
        this.saveSegment(id, v)
      }
    })
  }

  getSegment(id) {
    this.mem.versions = this.mem.versions || {}
    if (!this.mem.versions[id] || !this.versions[id] || this.mem.versions[id] !== this.versions[id]) {
      this.reloadSegment(id)
    }
    return this.mem.pendingSaves[id] || (typeof this.segments[id] === 'undefined' ? false : this.segments[id])
  }

  reloadSegment(id) {
    this.mem.versions[id] = this.mem.versions[id] || 0
    this.versions[id] = this.mem.versions[id]
    if (this.mem.pendingSaves[id]) {
      return this.mem.pendingSaves[id]
    }
    if (this.hasSegment(id)) {
      let v = RawMemory.segments[id]
      if (v[0] === '{' || v[0] === '[') {
        v = JSON.parse(v)
      }
      this.segments[id] = v
    }
    return false
  }

  initSegment(id, v = {}) {
    RawMemory.segments[id] = JSON.stringify(v)
  }

  hasSegment(id) {
    return typeof RawMemory.segments[id] !== 'undefined'
  }

  saveSegment(id, v) {
    if (typeof v === 'object') v = JSON.stringify(v, null, this.mem.readable[id] ? 2 : null)
    if (v.length > 100 * 1024) return console.log(`Segment ${id} too long ${Math.floor(v.length / 1024)}kb`)
    RawMemory.segments[id] = v
    delete this.mem.pendingSaves[id]
  }

  markForSaving(id, v) {
    this.mem.pendingSaves[id] = v
    this.mem.versions[id] = this.mem.versions[id] || 0
    this.mem.versions[id]++
  }

  load(id) {
    if (!~this.fixed.indexOf(id)) {
      this.lru[id] = Game.time
    }
    return this.getSegment(id)
  }

  save(id, v) {
    if (!~this.fixed.indexOf(id)) {
      this.lru[id] = Game.time
    }
    this.markForSaving(id, v)
  }

  wrap(name, id) {
    Object.defineProperty(RawMemory, name, {
      get: function () {
        return this.mem.pendingSaves[id] || RawMemory.segments[id]
      },
      set: function (v) {
        return this.markForSaving(id, v)
      }
    })
  }

  posttick() {
    this.endOfTick()
  }
}
/*
interface SegmentExtension {
  // Returns undefined if segment isn't loaded,
  // else parsed JSON if contents is JSON, else string
  load(id: Number): SegmentValue | undefined;
  // marks segment for saving, implementations
  // may save immediately or wait until end of tick
  // subsequent load calls within the same tick should
  // return this value
  save(id: Number, value: SegmentValue): void;
  // Should add ID to active list
  activate(id: Number): void;
}

interface SegmentValue {}

*/
const memManager = new MemoryManager()
export default memManager


function * memoryManager () {
  log = this.log
  const maintain = [
    ['writer', writer],
    ['reader', reader],
    ['cleanup', cleanup]
  ]
  while (true) {
    for (const [name, fn, ...args] of maintain) {
      if (!this.hasThread(name)) {
        this.createThread(name, fn, ...args)
      }
    }
    yield* sleep(10)
  }
}

function syncActiveSegments () {
  const active = Array.from(activeSegments).slice(-10)
  RawMemory.setActiveSegments(active)
}

export function * activateSegment (id) {
  activeSegments.add(+id)
  syncActiveSegments()
}

export function * deactivateSegment (id) {
  activeSegments.delete(+id)
  syncActiveSegments()
}

export function * getSegment (id, { keepActive = false } = {}) {
  id = id.toString()
  if (!segments.has(id)) {
    yield * activateSegment(id)
    while (!segments.has(id)) {
      log.info(`Waiting for segment ${id}`)
      yield
    }
    if (!keepActive) {
      yield * deactivateSegment(id)
    }
  }
  return segments.get(id).proxy
}

function * reader () {
  while (true) {
    this.log.info(`Segments ${Object.keys(RawMemory.segments).join(',')}`)
    for (const id in RawMemory.segments) {
      const raw = RawMemory.segments[id]
      if (!segments.has(id)) {
        this.log.info(`Loading segment ${id}`)
        const instance = {
          id,
          dirty: false,
          stale: false,
          raw: '',
          ts: Game.time,
          save () {
            instance.dirty = true
          }
        }
        instance.proxy = new Proxy(instance, {
          get (target, name) {
            if (name === 'save') return target[name]
            return target.data[name]
          },
          set (target, name, value) {
            target.data[name] = value
            target.dirty = true
            return true
          }
        })
        segments.set(id, instance)
      }
      const seg = segments.get(id)
      if (!raw) {
        this.log.info(`Initializing segment ${id}`)
        seg.raw = '{}'
        seg.dirty = true
        seg.data = JSON.parse(seg.raw)
      } else if (seg.raw !== raw && !seg.dirty) {
        this.log.info(`Reading segment ${id}`)
        seg.raw = raw
        seg.data = JSON.parse(seg.raw)
      }
    }
    yield
  }
}

function * writer () {
  while (true) {
    let cnt = 0
    for (const seg of segments.values()) {
      if (cnt === 10) break
      if (seg.dirty) {
        seg.raw = JSON.stringify(seg.data)
        seg.dirty = false
        if (seg.raw.length > 100 * 1024) {
          this.log.warn(`Segment ${seg.id} too long ${Math.floor(seg.raw.length / 1024)}kb, not writing`)
          continue
        }
        this.log.info(`Writing segment ${seg.id} (${Math.floor(seg.raw.length / 1024)}kb)`)
        RawMemory.segments[seg.id] = seg.raw
        cnt++
      }
    }
    yield
  }
}

function * cleanup () {
  while (true) yield
}
