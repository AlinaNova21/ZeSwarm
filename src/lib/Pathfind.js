import buckets from 'buckets-js'
import portals from '../tmp/shard3.portals.min.js'
import { getRoomNameFromXY, roomNameToXY } from './WorldMap'
const mappedPortals = {}

for (const [src, shard, dst, decayTime] of portals) {
  if (decayTime <= Game.time) continue
  mappedPortals[src] = mappedPortals[src] || []
  mappedPortals[src].push([shard, dst, decayTime])
  if (shard === Game.shard.name) {
    mappedPortals[dst] = mappedPortals[dst] || []
    mappedPortals[dst].push([shard, src, decayTime])
  }
}

export class Graph {
  constructor () {
    this.edges = []
    this.nodes = {}
    this.links = []
  }

  addEdge (a, b, opts) {
    if (this.nodes[a] && this.nodes[b]) {
      this.edges.push([a, b, opts])
      this.edges.push([b, a, opts])
      this.links.push({ source: a, target: b, weight: opts.weight || 1 })
      this.nodes[a].edges[b] = opts
      this.nodes[b].edges[a] = opts
      this.nodes[a].neighbors.push(b)
      this.nodes[b].neighbors.push(a)
    }
  }

  addNode (node) {
    node.edges = {}
    node.neighbors = []
    this.nodes[node.id] = node
  }

  neighbors (node) {
    return this.nodes[node].neighbors
  }

  cost (a, b) {
    return this.nodes[a].edges[b].weight
  }

  heuristic (a, b) {
    const nA = this.nodes[a]
    const nB = this.nodes[b]
    if (nA.shard !== nB.shard) return 1000
    const dist = Math.abs(nA.pos[0] - nB.pos[0]) + Math.abs(nA.pos[1] - nB.pos[1])
    return dist
  }
}

export class MapGraph extends Graph {
  addRoom (shard, room) {
    const id = `${shard}/${room}`
    const pos = roomNameToXY(room)
    const bus = pos[0] % 10 === (pos[0] < 0 ? 9 : 0) || pos[1] % 10 === (pos[1] < 0 ? 9 : 0)
    this.addNode({ id, pos, room, shard, bus })
  }

  neighbors (node) {
    const n = this.nodes[node]
    if (!n._described && n.shard === Game.shard.name) {
      n._described = true
      const ns = Game.map.describeExits(n.room)
      if (!ns) return n.neighbors
      for (const [dir, room] of Object.entries(ns)) {
        // if (!Game.map.isRoomAvailable(room)) continue
        const id = `${Game.shard.name}/${room}`
        if (!this.nodes[id]) {
          this.addRoom(Game.shard.name, room)
        }
        this.addEdge(node, id, { dir, weight: 50 })
      }
      const portals = mappedPortals[node]
      if (portals) {
        for (const [shard, room] of portals) {
          const id = `${shard}/${room}`
          if (!this.nodes[id]) {
            this.addRoom(shard, room)
          }
          this.addEdge(node, id, { weight: 25 })
        }
      }
    }
    return n.neighbors
  }

  cost (a, b) {
    if (!b.bus) return 4
    if (b.bus) return 1
    return 2
  }
}

export function pathfind (graph, start, goal, { maxRooms = 16, maxCost = 1600 } = {}) {
  console.log(graph)
  // return { cost: 0, path: [] }
  // @ts-ignore
  const frontier = new buckets.PriorityQueue((a, b) => b[1] - a[1])
  frontier.enqueue([start, 0])
  const cameFrom = {}
  const costSoFar = {}
  cameFrom[start] = null
  costSoFar[start] = 0
  while (!frontier.isEmpty()) {
    const [current] = frontier.dequeue()
    if (costSoFar[current] > maxCost) continue
    for (const next of graph.neighbors(current)) {
      const newCost = costSoFar[current] + graph.cost(current, next)
      if (!costSoFar[next] || newCost < costSoFar[next]) {
        costSoFar[next] = newCost
        const priority = newCost + graph.heuristic(goal, next)
        frontier.enqueue([next, priority])
        cameFrom[next] = current
      }
    }
    // yield { current, start, goal, cameFrom, costSoFar, frontier }
  }
  const path = []
  let current = goal
  while (current !== start) {
    path.push(current)
    current = cameFrom[current]
  }
  path.push(start)
  path.reverse()
  return { cost: costSoFar[goal], path: path.map(id => graph.nodes[id]) }
}
