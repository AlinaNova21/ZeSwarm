
declare global {
  interface Memory {
    __kvIndex?: Record<string, any>
  }
}

class KVStore {
  prefix: string
  segments: number[]
  data: Record<string, any>

  constructor () {
    this.prefix = ''
    this.segments = []
    for (let i = 50; i < 100; i++) {
      this.segments.push(i)
    }
    this.data = {}
  }
  
  get index (): Record<string, any> {
    return Memory.__kvIndex || {}
  }
  
  set (k: string, v: any): void {
    this.data[k] = v
  }
  
  get (k: string): any {
    return this.data[k]
  }
}

export default KVStore