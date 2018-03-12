export default class BaseProcess {
  constructor (context) {
    this.context = context
    this.kernel = this.context.queryPosisInterface('baseKernel')
    this.spawn = this.context.queryPosisInterface('spawn')
    this.sleep = this.context.queryPosisInterface('sleep')
  }
  get log () {
    return this.context.log
  }
  get memory () {
    return this.context.memory
  }
  get children () {
    this.memory.children = this.memory.children || {}
    return this.memory.children
  }
  get creeps () {
    this.memory.creeps = this.memory.creeps || {}
    return this.memory.creeps
  }
  exit () {
    this.kernel.killProcess(this.id)
  }
  run () {}
  ensureChild (id, name, context) {
    let child = this.children[id]
    let proc
    if (child) {
      proc = this.kernel.getProcessById(child)
    }
    if (!child || !proc) {
      this.log.info(`Process doesn't exist, spawning ${id} ${name}`)
      let { pid, process } = this.kernel.startProcess(name, context)
      proc = process
      this.children[id] = pid
    }
    return proc
  }
  cleanChildren () {
    let keys = Object.keys(this.children)
    for (let i = 0; i < keys.length; i++) {
      let k = keys[i]
      let proc = this.kernel.getProcessById(this.children[k])
      if (!proc) {
        this.children[k] = undefined
      }
    }
  }
  ensureCreep (id, def) {
    let cid = this.creeps[id]
    let stat = cid && this.spawn.getStatus(cid)
    let complete = stat && (stat.status === C.EPosisSpawnStatus.ERROR || stat.status === C.EPosisSpawnStatus.SPAWNED)
    let bodyTime = def.body[0].length * C.CREEP_SPAWN_TIME
    let creep = this.spawn.getCreep(cid)
    let dyingOrDead = !creep || creep.ticksToLive < (bodyTime + 10)
    if (!cid || (complete && dyingOrDead)) {
      cid = this.spawn.spawnCreep(def)
      this.log.info(`Creep doesn't exist, spawning ${id} ${cid}`)
    }
    this.creeps[id] = cid
    return cid
  }
}
