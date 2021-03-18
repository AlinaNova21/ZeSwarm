const fs = require('fs')

const SYMBOLS = [
  "symbol_aleph", "symbol_beth", "symbol_gimmel", "symbol_daleth", "symbol_he",
  "symbol_waw", "symbol_zayin", "symbol_heth", "symbol_teth", "symbol_yodh",
  "symbol_kaph", "symbol_lamedh", "symbol_mem", "symbol_nun", "symbol_samekh",
  "symbol_ayin", "symbol_pe", "symbol_tsade", "symbol_qoph", "symbol_res",
  "symbol_sim", "symbol_taw"]


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
    ['W21N24','symbol_gimmel', 'GT500'],
    ['W27N28','symbol_pe', 'GT500'],
    ['W23N28','symbol_sim', 'GT500'],
    ['W23N21','symbol_lamedh', 'GT500'],
    ['W29N22','symbol_taw', 'GT500'],
    ['W29N26','symbol_nun', 'GT500'],
    ['W11N12','symbol_kaph', 'Montblanc'],
    ['W11N17','symbol_nun', 'Montblanc'],
    ['W14N18','symbol_yodh', 'Montblanc'],
    ['W18N13','symbol_mem', 'Montblanc'],
    ['W18N17','symbol_pe', 'Montblanc'],
  ]
  const existing = []
  for (const room of Object.values(data.rooms)) {
    const [dec] = room.symbolDecoders
    if (room.level && dec) {
      owned.add(dec.resourceType)
      existing.push([room.name, room.level, dec.resourceType, room.owner])
    }
  }
  for (const [room, sym, user] of external) {
    if (existing.find(([r]) => r === room)) continue
    owned.add(sym)
    existing.push([room, 0, sym, user])
  }
  existing.sort((a,b) => b[1] - a[1])
  const padr = (v,l) => (v+' '.repeat(l)).slice(0,l)
  console.log(`Existing:`)
  for (const [room, level, sym, owner] of existing) {
    console.log(`  ${room} ${level || '-'} ${padr(sym, 13)} ${owner}`)
  }
  console.log('')
  console.log(`Missing:`)
  console.log(` ${SYMBOLS.filter(s => !owned.has(s))}`)
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