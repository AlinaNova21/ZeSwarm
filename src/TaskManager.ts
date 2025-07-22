import { Tree }  from '@/lib/Tree'
import { Logger } from './log'
import { kernel } from './kernel'

interface TaskDefinition {
  parent?: string
  virtual?: boolean
  name?: string
  weight?: number
  filter?: (task: TaskDefinition) => boolean
}

interface FindTaskOptions {
  start?: string
  filter?: (task: TaskDefinition) => boolean
}

const tasks = new Map<string, TaskDefinition>()
const tree  = new Tree()
const log = new Logger('[TaskManager]')
const assigned = new Set<string>()

kernel.createProcess('TaskManager', TaskManager)

function * TaskManager (): Generator<void, void, void> {
  tree.root.virtual = true
  while (true) {
    for (const room of Object.values(Game.rooms)) {
      if (!room.controller || !room.controller.my) continue
      createTask(`room_${room.name}`, { parent: 'root', virtual: true })
    }
    this.log.info(`Assigned: ${assigned.size}/${tasks.size}`)
    yield
  }
}

export function createTask(name: string, def: TaskDefinition): void {
  if (def.parent && !tree.nodes[def.parent]) {
    log.warn(`Invalid Task ${name}: Parent ${def.parent} doesn't exist`)
    return
  }
  tasks.set(name, def)
  def.name = def.name || name
  const node = tree.nodes[name] || tree.newNode(name, def.parent || 'root')
  node.weight = def.weight || 0
  node.treeWeight = node.weight + (tree.nodes[node.parent].treeWeight || 0)
}

export function destroyTask(name: string): void {
  abandonTask(name)
  tasks.delete(name)
  tree.walkNode(name, node => {
    for (const child of node.children) {
      delete tree.nodes[child]
      tasks.delete(child)
    }
    delete tree.nodes[node.id]
  })
}

export function getTask(name: string): TaskDefinition | undefined {
  return tasks.get(name)
}

export function findTask(opts: FindTaskOptions): TaskDefinition | undefined {
  const start = opts.start || 'root'
  const task = tree.walkNode(start, node => {
    const task = tasks.get(node.id)
    console.log(JSON.stringify(task), JSON.stringify(Array.from(tasks.values())))
    if (!task || task.virtual || assigned.has(task.name)) return undefined
    if (typeof opts.filter === 'function' && !opts.filter(task)) return undefined
    return task
  })
  if (task) {
    assigned.add(task.name)
  }
  return task
}

export function abandonTask(name: string): void {
  assigned.delete(name)
}