export const SYMBOL_MAP = {
  [global.RESOURCE_SYMBOL_ALEPH]: '𐤀',
  [global.RESOURCE_SYMBOL_BETH]: '𐤁',
  [global.RESOURCE_SYMBOL_GIMMEL]: '𐤂',
  [global.RESOURCE_SYMBOL_DALETH]: '𐤃',
  [global.RESOURCE_SYMBOL_HE]: '𐤄',
  [global.RESOURCE_SYMBOL_WAW]: '𐤅',
  [global.RESOURCE_SYMBOL_ZAYIN]: '𐤆',
  [global.RESOURCE_SYMBOL_HETH]: '𐤇',
  [global.RESOURCE_SYMBOL_TETH]: '𐤈',
  [global.RESOURCE_SYMBOL_YODH]: '𐤉',
  [global.RESOURCE_SYMBOL_KAPH]: '𐤊',
  [global.RESOURCE_SYMBOL_LAMEDH]: '𐤋',
  [global.RESOURCE_SYMBOL_MEM]: '𐤌',
  [global.RESOURCE_SYMBOL_NUN]: '𐤍',
  [global.RESOURCE_SYMBOL_SAMEKH]: '𐤎',
  [global.RESOURCE_SYMBOL_AYIN]: '𐤏',
  [global.RESOURCE_SYMBOL_PE]: '𐤐',
  [global.RESOURCE_SYMBOL_TSADE]: '𐤑',
  [global.RESOURCE_SYMBOL_QOPH]: '𐤒',
  [global.RESOURCE_SYMBOL_RES]: '𐤓',
  [global.RESOURCE_SYMBOL_SIN]: '𐤔',
  [global.RESOURCE_SYMBOL_TAW]: '𐤕',
}

export const SYMBOL_COLORS = {
  [global.RESOURCE_SYMBOL_ALEPH]: '#C63946',
  [global.RESOURCE_SYMBOL_BETH]: '#B72E6F',
  [global.RESOURCE_SYMBOL_GIMMEL]: '#B72FA5',
  [global.RESOURCE_SYMBOL_DALETH]: '#A334B7',
  [global.RESOURCE_SYMBOL_HE]: '#9D41ED',
  [global.RESOURCE_SYMBOL_WAW]: '#8441ED',
  [global.RESOURCE_SYMBOL_ZAYIN]: '#6E49FF',
  [global.RESOURCE_SYMBOL_HETH]: '#4E71FF',
  [global.RESOURCE_SYMBOL_TETH]: '#5088F4',
  [global.RESOURCE_SYMBOL_YODH]: '#3DA1EA',
  [global.RESOURCE_SYMBOL_KAPH]: '#38A9C7',
  [global.RESOURCE_SYMBOL_LAMEDH]: '#35B7B5',
  [global.RESOURCE_SYMBOL_MEM]: '#36B79A',
  [global.RESOURCE_SYMBOL_NUN]: '#33B75D',
  [global.RESOURCE_SYMBOL_SAMEKH]: '#3FB147',
  [global.RESOURCE_SYMBOL_AYIN]: '#69A239',
  [global.RESOURCE_SYMBOL_PE]: '#7EA232',
  [global.RESOURCE_SYMBOL_TSADE]: '#9FA23B',
  [global.RESOURCE_SYMBOL_QOPH]: '#BB933A',
  [global.RESOURCE_SYMBOL_RES]: '#D88942',
  [global.RESOURCE_SYMBOL_SIN]: '#DC763D',
  [global.RESOURCE_SYMBOL_TAW]: '#D64B3D'
}

// const originalResource = RoomVisual.prototype.resource
// RoomVisual.prototype.resource = function (type, x, y, size = 0.25) {
//   if (SYMBOLS.includes(type)) {
//     const outline = [
//       [64, 128],
//       [24.45, 121.78],
//       [6.31, 86.07],
//       [0, 46.52],
//       [28.35, 18.23],
//       [64, 0],
//       [99.65, 18.23],
//       [128, 46.52],
//       [121.69, 86.07],
//       [103.55, 121.78],
//       [64, 128]
//     ].map(([x, y]) => [x - 64, y - 64])
//       .map(([x, y]) => [x / 128, y / 128])
//     this.poly(relPoly(x, y, outline, size), {
//       opacity: 1,
//       fill: SYMBOL_COLORS[type],
//       stroke: 'transparent'
//     })
//     this.text(SYMBOL_MAP[type], x, y + (size * 0.35), {
//       font: `bold ${size * 0.8} arial`,
//       color: 'black'
//     })
//     return this
//   }
//   return originalResource.call(this, x, y, size)
// }