import log from '/log'
import C from '/constants'
import { createTask, destroyTask, findTask, getTask } from '../TaskManager'

export default {
  testing() {
    // this.pop()
    if (this.creep.getActiveBodyparts(TOUGH)) {
      this.push('testingNoMove')
    } else {
      this.push('testingTug')
    }
  },
  testingNoMove() {
    
    const rand = () => {
      const t = this.creep.room.getTerrain()
      const r = () => Math.floor(Math.random() * 44) + 3
      let x = r(), y = r()
      while (t.get(x, y) !== 0 || this.creep.room.lookForAt(C.LOOK_STRUCTURES, x, y).length) {
        x = r()
        y = r()
      }
      return { x, y }
    }
    const dst = rand()
    this.push('testingWaitForPos', dst)
    return this.runStack()
  },
  testingWaitForPos(pos) {
    createTask(`pull_${this.creep.name}`, {
      parent: `room_${this.creep.room.name}`,
      type: 'worker',
      dst: pos,
      action: 'pullToPos',
      creep: this.creep.name
    })
    this.creep.room.visual.circle(pos)
    this.creep.room.visual.line(this.creep.pos, pos)
    if (this.creep.pos.isEqualTo(pos.x, pos.y)) {
      this.creep.say('There!')
      destroyTask(`pull_${this.creep.name}`)
      this.pop()
      return this.runStack()
    }
  },
  testingTug() {
    const task = findTask({
      filter: t => t.type === 'worker'
    })
    if (task) {
      this.push('testingRunTask', task.name)
      this.log.info(`Got task ${task.name}`)
      this.creep.say(`got task`)
    } else {
      this.log.info('No Task')
      this.creep.say('No Task')
    }
  },
  testingRunTask(taskName) {
    const task = getTask(taskName)
    if (!task) return this.pop()
    const tcreep = Game.creeps[task.creep]
    if (!tcreep) return this.pop()
    if (!this.creep.pos.isNearTo(tcreep)) {
      this.push('moveNear', tcreep.pos)
      return this.runStack()
    }
    if (!this.creep.pos.isEqualTo(task.dst.x, task.dst.y)) {
      this.creep.say(`P ${task.dst.x},${task.dst.y}`)
      this.creep.moveTo(task.dst.x, task.dst.y)
      this.creep.pull(tcreep)
      tcreep.move(this.creep)
      return
    } else {
      this.creep.say('Swap')
      this.creep.move(tcreep)
      this.creep.pull(tcreep)
      tcreep.move(this.creep)
      this.pop()
    }
  }
}
