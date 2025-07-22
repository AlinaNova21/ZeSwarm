
class KVStore {
  constructor () {
    this.prefix = ''
    this.segments = []
    for (let i = 50; i < 100; i++) {
      this.segments.push(i)
    }
    this.data = {}
  }
  get index () {
    return Memory.__kvIndex || {}
  }
  set (k, v) {
    this.data[k] = v
  }
  get (k) {
    return this.data[k]
  }
}

export default KVStore