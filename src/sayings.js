const sayings = `
Wandering
Scouting!
Looking|for food
Hello!
Coming|Through
Hunting|rabbits
...
`.split("\n").filter(s => s)
const shooting = `
🔫PEW PEW🔫
🔫FIRE!!🔫
Get Food
`.split("\n").filter(s => s)
const psayings = `
Looking|for food|in|USER's|room
Prepare|to be|eaten|USER
Planning|to eat|USER
Scouting|USER
...
`.split("\n").filter(s => s)

module.exports = {
  sayings,
  shooting,
  psayings
}