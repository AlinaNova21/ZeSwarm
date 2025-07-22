const sayings: string[] = `
Wandering
Scouting!
Looking|for food
Hello!
Coming|Through
Hunting|rabbits
...
`.split('\n').filter(s => s)
const shooting: string[] = `
🔫PEW PEW🔫
🔫FIRE!!🔫
Get Food
`.split('\n').filter(s => s)
const psayings: string[] = `
Looking|for food|in|USER's|room
Prepare|to be|eaten|USER
Planning|to eat|USER
👁️ USER
...
👁️
`.split('\n').filter(s => s)

export { sayings, shooting, psayings }
export default {
  sayings,
  shooting,
  psayings
}
