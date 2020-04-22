import MemHack from './MemHack'
import stats from './stats'
import './prototypes.room'
import './Traveler'
import './RoomVisual'
import { kernel } from './kernel'
import './Intel'
import './manager'
import './CreepManager'
import './DefenseManager'
import './ExpansionPlanner'
import './LayoutManager'
import './RaidManager'
import './SpawnManager'
import './ui'
import './Test'
import memoryManager from './MemoryManager'
import log from '/log'
import size from 'lodash/size'
import groupBy from 'lodash/groupBy'
import C from './constants'

if (!Memory.lastTick) {
  Memory.lastTick = Date.now()
}

export function loop () {
  MemHack.pretick()
  stats.reset()
  stats.addStat('memory', {}, {
    parse: MemHack.parseTime,
    used: RawMemory.get().length
  })
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
  console.log(`User: ${C.USER}`)

  const vis = new RoomVisual()
  vis.text(`Tick Timing ${(t / 1000).toFixed(3)}s`, 25, 3, { size: 3 })
  vis.text(`Avg ${(avg / 1000).toFixed(3)}s`, 25, 6, { size: 3 })

  const ccnt = size(Game.creeps)
  vis.text(`${ccnt} alive`, 25, 8, { size: 1 })

  const roles = groupBy(Game.creeps, c => c.memory.role || (c.memory.stack && c.memory.stack[0][0]) || 'unknown')
  console.log(`${ccnt} alive`)
  let off = 0
  for (const role in roles) {
    const cnt = (' '.repeat(3) + roles[role].length).slice(-3)
    vis.text(`${cnt} ${role}`, 25, 9 + off++, { size: 1 })
  }
  kernel.tick()
  memoryManager.posttick()
  stats.commit()
  vis.text(`${Game.cpu.getUsed().toFixed(3)} cpu`, 25, 7, { size: 1 })
  try {
    // eslint-disable-next-line camelcase
    const { used_heap_size, heap_size_limit, total_available_size } = Game.cpu.getHeapStatistics()
    const MB = (v) => ((v / 1024) / 1024).toFixed(3)
    log.warn(`HEAP: Used: ${MB(used_heap_size)}MB Available: ${MB(total_available_size)}MB Limit: ${MB(heap_size_limit)}MB`)
  } catch (e) {
    log.warn('HEAP: Unavailable')
  }
}
