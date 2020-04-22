import C from '/constants'

export const core = {
  size: [7, 7],
  structures: []
}

const p = (x, y, structure, minLevel) => core.structures.push({ x, y, structure, minLevel })

p(0, 2, C.STRUCTURE_SPAWN, 1)
p(-2, -1, C.STRUCTURE_SPAWN, 7)
p(2, -1, C.STRUCTURE_SPAWN, 8)

p(0, 1, C.STRUCTURE_EXTENSION, 2)
p(-1, 2, C.STRUCTURE_EXTENSION, 2)
p(-2, 2, C.STRUCTURE_EXTENSION, 2)
p(1, 2, C.STRUCTURE_EXTENSION, 2)
p(2, 2, C.STRUCTURE_EXTENSION, 2)

p(-2, 0, C.STRUCTURE_CONTAINER, 2)

p(-2, 1, C.STRUCTURE_EXTENSION, 3)
p(2, 1, C.STRUCTURE_EXTENSION, 3)
p(-1, 0, C.STRUCTURE_EXTENSION, 3)
p(1, 0, C.STRUCTURE_EXTENSION, 3)
p(0, -1, C.STRUCTURE_EXTENSION, 3)

p(-2, -2, C.STRUCTURE_EXTENSION, 3)
p(-1, -2, C.STRUCTURE_EXTENSION, 3)
p(0, -2, C.STRUCTURE_EXTENSION, 3)
p(1, -2, C.STRUCTURE_EXTENSION, 3)
p(2, -2, C.STRUCTURE_EXTENSION, 3)

p(2, 0, C.STRUCTURE_CONTAINER, 3)

p(0, 0, C.STRUCTURE_LINK, 5)

for (let i = -2; i <= 2; i++) {
  p(i, -3, C.STRUCTURE_ROAD, 3)
  p(i, 3, C.STRUCTURE_ROAD, 3)
  p(-3, i, C.STRUCTURE_ROAD, 3)
  p(3, i, C.STRUCTURE_ROAD, 3)
}