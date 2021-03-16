
class KVStore {
  constructor () {
    this.prefix = ''
    this.segments = []
    for (let i = 50; i < 10; i++) {
      this.segments.push(i)
    }
    this.data = {}
  }
  get index () {
    return Memory.__kvIndex
  }
  set (k, v) {
    this.data = 
  }
}

export function set()