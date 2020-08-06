import sortedIndexBy from 'lodash/sortedIndexBy'

export class Tree {
  constructor () {
    this.nodes = {}
    this.root = this.newNode('root')
  }

  newNode (id, parent) {
    const node = {
      id,
      weight: 1,
      treeWeight: 0,
      parent: parent,
      children: []
    }
    if (this.nodes[parent]) {
      this.nodes[parent].children.push(id)
    }
    this.nodes[id] = node
    return node
  }

  calcWeight () {
    this.walk(node => {
      node.treeWeight = node.weight + node.children.reduce((l, c) => l + this.nodes[c].treeWeight, 0)
    })
  }

  walk (cb) {
    return this.walkNode('root', cb)
  }

  walkNode (name, cb) {
    const node = this.nodes[name]
    if (!node) return
    for (const child of node.children) {
      const v = this.walkNode(child, cb)
      if (v) return v
    }
    return cb(node)
  }
}

function test () { // eslint-disable-line no-unused-vars
  const tree = new Tree()
  const scouts = tree.newNode('scouts', 'root')
  scouts.weight = 1
  for (let i = 0; i < 3; i++) {
    const name = `room${i}`
    tree.newNode(name, 'root')
    const harvesters = tree.newNode(`${name}_harvesters`, name)
    harvesters.weight = 20
    const collectors = tree.newNode(`${name}_collectors`, name)
    collectors.weight = 19
    const workers = tree.newNode(`${name}_workers`, name)
    workers.weight = 10
    tree.newNode(`${name}_cleaningCrew`, name)
  }
  tree.calcWeight()
  tree.walk(node => console.log(node, node.treeWeight))
  const roomQueues = [[], [], []]
  for (let i = 0; i < 3; i++) {
    const q = roomQueues[i]
    tree.walkNode(`room${i}`, node => {
      const ind = sortedIndexBy(q, node, 'treeWeight')
      q.splice(ind, 0, node)
    })
  }
  console.log(roomQueues)
}
