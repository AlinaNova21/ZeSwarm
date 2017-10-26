import { minBy, map } from 'lodash-es'

export default class MemoryManager {
  get mem () {
    return this.memget()
  }
  constructor (memget) {
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
  activate (id) {
    if (this.mem.active.indexOf(id) === -1) {
      this.mem.active.push(id)
    }
  }
  deactivate (id) {
    let ind = this.mem.active.indexOf(id)
    if (ind === -1) return
    this.mem.active.splice(ind, 1)
  }
  endOfTick () {
    try {
      while (this.mem.active > 10) {
        let min = minBy(map(this.mem.lru, (time, id) => ({ id, time })), 'time')
        let ind = this.mem.active.indexOf(min.id)
        delete this.mem.lru[min.id]
        if (ind !== -1) {
          this.mem.active.splice(ind, 1)
        }
      }
      RawMemory.setActiveSegments(this.mem.active)
    } catch (e) {
      this.mem.active = [0]
    }
    Object.keys(RawMemory.segments).filter(k => k < 90).forEach(k => delete RawMemory.segments[k])
    let rem = 10 - Object.keys(RawMemory.segments).length
    _.each(this.mem.pendingSaves, (v, id) => {
      if (rem--) {
        this.saveSegment(id, v)
      }
    })
  }
  getSegment (id) {
    if (!this.mem.versions[id] || !this.versions[id] || this.mem.versions[id] !== this.versions[id]) {
      this.reloadSegment(id)
    }
    return this.mem.pendingSaves[id] || this.segments[id] || false
  }
  reloadSegment (id) {
    this.versions[id] = this.mem.versions[id] || 0
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
  initSegment (id, v = {}) {
    RawMemory.segments[id] = JSON.stringify(v)
  }
  hasSegment (id) {
    return typeof RawMemory.segments[id] !== 'undefined'
  }
  saveSegment (id, v) {
    if (typeof v === 'object') v = JSON.stringify(v, null, this.mem.readable[id] ? 2 : null)
    RawMemory.segments[id] = v
    delete this.mem.pendingSaves[id]
  }
  markForSaving (id, v) {
    this.mem.pendingSaves[id] = v
    this.mem.versions[id] = this.mem.versions[id] || 0
    this.mem.versions[id]++
  }
  load (id) {
    if (!~this.fixed.indexOf(id)) {
      this.mem.lru[id] = Game.time
    }
    return this.getSegment(id)
  }
  save (id, v) {
    if (!~this.fixed.indexOf(id)) {
      this.mem.lru[id] = Game.time
    }
    this.markForSaving(id, v)
  }
  wrap (name, id) {
    Object.defineProperty(RawMemory, name, {
      get: function () {
        return this.mem.pendingSaves[id] || RawMemory.segments[id]
      },
      set: function (v) {
        return this.markForSaving(id, v)
      }
    })
  }
}
