import MemHack from './MemHack'
import './prototypes.room'
import './Traveler'
import layout from './layout'
import manager from './manager'
import { kernel } from './kernel'
import intel from './Intel'
import './CreepManager'
import './DefenseManager'

if (!Memory.lastTick) {
  Memory.lastTick = Date.now()
}

console.log('preloop')
export function loop () {
  console.log('loop')
  MemHack.pretick()
  const now = Date.now()
  const lt = Memory.lastTick
  Memory.lastTick = now
  const t = now - lt
  let n = Memory.avgCnt || 1
  let avg = Memory.avg || t
  avg = avg + (t - avg) / ++n
  Memory.avg = avg
  Memory.avgCnt = n

  console.log(`Tick Timing ${(t / 1000).toFixed(3)}s`)
  console.log(`Avg ${(avg / 1000).toFixed(3)}s`)

  const vis = new RoomVisual()
  vis.text(`Tick Timing ${(t / 1000).toFixed(3)}s`, 25, 3, { size: 3 })
  vis.text(`Avg ${(avg / 1000).toFixed(3)}s`, 25, 6, { size: 3 })

  const workers = _.filter(Game.creeps, c => c.memory.role === 'worker')
  const scouts = _.filter(Game.creeps, c => c.memory.role === 'scout')
  const ccnt = _.size(Game.creeps)
  vis.text(`${ccnt} alive`, 25, 8, { size: 1 })

  const roles = _.groupBy(Game.creeps, c => c.memory.role || c.memory.stack[0][0])
  console.log(`${ccnt} alive`)
  let off = 0
  for (const role in roles) {
    const cnt = (' '.repeat(3) + roles[role].length).slice(-3)
    vis.text(`${cnt} ${role}`, 25, 9 + off++, { size: 1 })
  }
  Memory.census = {
    workers,
    scouts
  }

  manager.tick()
  layout.run()
  kernel.tick()
  vis.text(`${Game.cpu.getUsed().toFixed(3)} cpu`, 25, 7, { size: 1 })
}
