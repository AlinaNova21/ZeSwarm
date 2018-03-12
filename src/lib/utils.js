export {
  ensureProcess(proc, id, name, context) {
    if (!t.process || !this.kernel.getProcessById(t.process)) {
      this.log.info(`Process doesn't exist, spawning for ${t.creep}`)
      let { pid, process } = this.kernel.startProcess('stackStateCreep', { spawnTicket: t.creep })
      process.push(state, source.id)
      t.process = pid
    }
  }
}