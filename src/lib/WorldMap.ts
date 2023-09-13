/**
 * @param {number} x
 * @param {number} y
 * @returns {string}
 */
export function getRoomNameFromXY(x: number, y: number): string {
  let ew = (x < 0) ? 'W' + (-x - 1) : 'E' + (x)
  let ns = (y < 0) ? 'N' + (-y - 1) : 'S' + (y)
  return ew + ns
}

/**
 * @param {string} name Room Name
 * @returns {[x: number,y: number]} [x,y]
 */
export function roomNameToXY(name: string): [x: number, y: number] {
  let [match, hor, x, ver, y] = name.match(/^(\w)(\d+)(\w)(\d+)$/)
  const xx = hor == 'W' ? (-x - 1) : +x
  const yy = ver == 'N' ? (-y - 1) : +y
  return [xx, yy]
}