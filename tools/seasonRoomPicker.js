const fs = require('fs')

async function read(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function run() {
  const data = JSON.parse(await read(process.stdin))
  const owned = new Set()
  const candidates = new Set()
  const external = [
    ['W21N24','symbol_gimmel', 'gt500'],
    ['W27N28','symbol_pe', 'gt500'],
    ['W23N28','symbol_sim', 'gt500'],
    ['W23N21','symbol_lamedh', 'gt500']
  ]
  console.log(`Existing:`)
  for (const room of Object.values(data.rooms)) {
    const [dec] = room.symbolDecoders
    if (room.level) {
      owned.add(dec.resourceType)
      console.log(`  ${room.name} ${room.level} ${dec.resourceType} ${room.owner}`)
    }
  }
  for (const [room, sym, user] of external) {
    owned.add(sym)
    console.log(`  ${room} - ${sym} ${user}`)
  }
  console.log('')
  console.log(`Candidates:`)
  for (const room of Object.values(data.rooms)) {
    const [dec] = room.symbolDecoders || []
    if (!dec) continue
    if (owned.has(dec.resourceType)) continue
    if (room.sources.length > 2) continue
    if (room.level) continue
    if (room.reserver) continue
    console.log(`  ${room.name} ${room.sources.length} ${dec.resourceType}`)
  }
}

run().catch(console.error)