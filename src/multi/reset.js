let step = 0

export default { loop }
export function loop () {
  let vis = new RoomVisual()
  if (step === 10) {
    iss.shardData().reset = false
    vis.text('CLEARED', 25, 25, { size: 5 })
    return
  }
  vis.text('RESET', 25, 20, { size: 5 })
  vis.text(`${step + 1}/10`, 25, 30, { size: 5 })
  console.log(`<h1>RESET ${step + 1}/10</h1>`)
  RawMemory.set('{}')
  Object.keys(RawMemory.segments).forEach(k => delete RawMemory.segments[k])
  let off = step * 10
  for (let i = 0; i < 10; i++) {
    RawMemory.segments[off + i] = ''
  }
  step++
}
