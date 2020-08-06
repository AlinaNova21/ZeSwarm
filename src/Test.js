import { kernel, sleep } from './kernel'
import { pathfind, MapGraph } from './lib/Pathfind'
import { createTicket } from './SpawnManager'

kernel.createProcess('Test', Test)

function * Test () {
  while (true) {
    // Game.notify("This is a test")
    if (false && Game.shard.name === 'screepsplus2' && Game.rooms.E7S6 && Game.rooms.E7S6.controller.my) {
      createTicket('testing', {
        parent: 'room_E7S6',
        weight: 100
      })
      createTicket('testingNoMove', {
        parent: 'testing',
        count: Math.ceil(Math.random() * 4),
        body: [TOUGH],
        memory: {
          role: 'testing'
        }
      })
      createTicket('testingTug', {
        parent: 'testing',
        count: Math.ceil(Math.random() * 4),
        body: [MOVE],
        memory: {
          role: 'testing'
        }
      })
    }
    yield * sleep(10)
  }
  return
  // while (true) {
  const start = Game.cpu.getUsed()
  const ret = PathFindTest()
  const end = Game.cpu.getUsed()
  const dur = end - start
  this.log.alert(`Time elapsed: ${dur}ms`)
  this.log.alert(ret)
  // yield * sleep(3)
  // }
}

function PathFindTest () {
  const [src, dst] = ['E6N49', 'E31N17']
  const graph = new MapGraph()
  graph.addRoom(Game.shard.name, src)
  graph.addRoom(Game.shard.name, dst)
  const { path, cost } = pathfind(graph, `${Game.shard.name}/${src}`, `${Game.shard.name}/${dst}`)
  return `Cost: ${cost} Path: ${path.map(p => p.room)}`
}
