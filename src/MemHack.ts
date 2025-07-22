// Usage:
// At top of main: import MemHack from './MemHack'
// Thats it!

interface MemHackModule {
  memory: any
  parseTime: number
  register(): void
  pretick(): void
}

const MemHack: MemHackModule = {
  memory: null,
  parseTime: -1,
  register (): void {
    const start = Game.cpu.getUsed()
    this.memory = Memory
    const end = Game.cpu.getUsed()
    this.parseTime = end - start
    // @ts-ignore: _parsed is an internal property
    this.memory = (RawMemory as any)._parsed
    // require.initGlobals = require.initGlobals || {}
    // require.initGlobals.memHack = () => this.pretick()
  },
  pretick (): void {
    delete (global as any).Memory
    ;(global as any).Memory = this.memory
    // @ts-ignore: _parsed is an internal property
    ;(RawMemory as any)._parsed = this.memory
  }
}
MemHack.register()
export default MemHack
