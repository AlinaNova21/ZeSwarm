export const SYMBOL_MAP = {
  [RESOURCE_SYMBOL_ALEPH]: '𐤀',
  [RESOURCE_SYMBOL_BETH]: '𐤁',
  [RESOURCE_SYMBOL_GIMMEL]: '𐤂',
  [RESOURCE_SYMBOL_DALETH]: '𐤃',
  [RESOURCE_SYMBOL_HE]: '𐤄',
  [RESOURCE_SYMBOL_WAW]: '𐤅',
  [RESOURCE_SYMBOL_ZAYIN]: '𐤆',
  [RESOURCE_SYMBOL_HETH]: '𐤇',
  [RESOURCE_SYMBOL_TETH]: '𐤈',
  [RESOURCE_SYMBOL_YODH]: '𐤉',
  [RESOURCE_SYMBOL_KAPH]: '𐤊',
  [RESOURCE_SYMBOL_LAMEDH]: '𐤋',
  [RESOURCE_SYMBOL_MEM]: '𐤌',
  [RESOURCE_SYMBOL_NUN]: '𐤍',
  [RESOURCE_SYMBOL_SAMEKH]: '𐤎',
  [RESOURCE_SYMBOL_AYIN]: '𐤏',
  [RESOURCE_SYMBOL_PE]: '𐤐',
  [RESOURCE_SYMBOL_TSADE]: '𐤑',
  [RESOURCE_SYMBOL_QOPH]: '𐤒',
  [RESOURCE_SYMBOL_RES]: '𐤓',
  [RESOURCE_SYMBOL_SIN]: '𐤔',
  [RESOURCE_SYMBOL_TAW]: '𐤕',
}

export const SYMBOL_COLORS = {
  [RESOURCE_SYMBOL_ALEPH]: '#C63946',
  [RESOURCE_SYMBOL_BETH]: '#B72E6F',
  [RESOURCE_SYMBOL_GIMMEL]: '#B72FA5',
  [RESOURCE_SYMBOL_DALETH]: '#A334B7',
  [RESOURCE_SYMBOL_HE]: '#9D41ED',
  [RESOURCE_SYMBOL_WAW]: '#8441ED',
  [RESOURCE_SYMBOL_ZAYIN]: '#6E49FF',
  [RESOURCE_SYMBOL_HETH]: '#4E71FF',
  [RESOURCE_SYMBOL_TETH]: '#5088F4',
  [RESOURCE_SYMBOL_YODH]: '#3DA1EA',
  [RESOURCE_SYMBOL_KAPH]: '#38A9C7',
  [RESOURCE_SYMBOL_LAMEDH]: '#35B7B5',
  [RESOURCE_SYMBOL_MEM]: '#36B79A',
  [RESOURCE_SYMBOL_NUN]: '#33B75D',
  [RESOURCE_SYMBOL_SAMEKH]: '#3FB147',
  [RESOURCE_SYMBOL_AYIN]: '#69A239',
  [RESOURCE_SYMBOL_PE]: '#7EA232',
  [RESOURCE_SYMBOL_TSADE]: '#9FA23B',
  [RESOURCE_SYMBOL_QOPH]: '#BB933A',
  [RESOURCE_SYMBOL_RES]: '#D88942',
  [RESOURCE_SYMBOL_SIN]: '#DC763D',
  [RESOURCE_SYMBOL_TAW]: '#D64B3D'
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