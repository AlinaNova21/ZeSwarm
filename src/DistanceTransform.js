/**
  distanceTransform
    @param {PathFinder.CostMatrix} foregroundPixels - object pixels. modified on output
    @param {number} oob - value used for pixels outside image bounds
    @return {PathFinder.CostMatrix}
  
  This function sets the non-zero positions in the input CostMatrix to the distance*
  to the nearest zero valued position.
  
  *distance is chessboard distance.
    the oob parameter is used so that if an object pixel is at the image boundary
    you can avoid having that reduce the pixel's value in the final output. Set
    it to a high value (e.g., 255) for this. Set oob to 0 to treat out of bounds
    as background pixels.
*/
module.exports.distanceTransform = function distanceTransform(foregroundPixels, oob = 255) {
  var dist = foregroundPixels; // not a copy. We're modifying the input
  // Variables to represent the 3x3 neighborhood of a pixel.
  var A, B, C;
  var D, E, F;
  var G, H, I;

  var x, y, value;
  for (y = 0; y < 50; ++y) {
    for (x = 0; x < 50; ++x) {
      if (foregroundPixels.get(x, y) !== 0) {
        A = dist.get(x - 1, y - 1); B = dist.get(x    , y - 1); C = dist.get(x + 1, y - 1);
        D = dist.get(x - 1, y    );
        if (y === 0) { A = oob; B = oob; C = oob; }
        if (x === 0) { A = oob; D = oob; }
        if (x == 49) { C = oob; }

        dist.set(x, y, Math.min(A, B, C, D) + 1);
      }
    }
  }

  for (y = 49; y >= 0; --y) {
    for (x = 49; x >= 0; --x) {
                                  E = dist.get(x   , y    ); F = dist.get(x + 1, y    );
      G = dist.get(x - 1, y + 1); H = dist.get(x   , y + 1); I = dist.get(x + 1, y + 1);
      if (y == 49) { G = oob; H = oob; I = oob; }
      if (x == 49) { F = oob; I = oob; }
      if (x === 0) { G = oob; }

      value = Math.min(E, F + 1, G + 1, H + 1, I + 1);
      dist.set(x, y, value);
    }
  }

  return dist;
}

module.exports.wallOrAdjacentToExit = function wallOrAdjacentToExit(x, y, roomName) {
  if (1 < x && x < 48 && 1 < y && y < 48) return Game.map.getTerrainAt(x, y, roomName) == 'wall';
  if (0 == x || 0 == y || 49 == x || 49 == y) return true;

  if (Game.map.getTerrainAt(x, y, roomName) == 'wall') return true;

  var A, B, C;
  if (x == 1) {
    A = Game.map.getTerrainAt(0, y-1, roomName); B = Game.map.getTerrainAt(0, y, roomName); C = Game.map.getTerrainAt(0, y+1, roomName);
  }
  if (x == 48) {
    A = Game.map.getTerrainAt(49, y-1, roomName); B = Game.map.getTerrainAt(49, y, roomName); C = Game.map.getTerrainAt(49, y+1, roomName);
  }
  if (y == 1) {
    A = Game.map.getTerrainAt(x-1, 0, roomName); B = Game.map.getTerrainAt(x, 0, roomName); C = Game.map.getTerrainAt(x+1, 0, roomName);
  }
  if (y == 48) {
    A = Game.map.getTerrainAt(x-1, 49, roomName); B = Game.map.getTerrainAt(x, 49, roomName); C = Game.map.getTerrainAt(x+1, 49, roomName);
  }
  return !(A == 'wall' && B == 'wall' && C == 'wall');
}

module.exports.blockablePixelsForRoom = function blockablePixelsForRoom(roomName) {
  var costMatrix = new PathFinder.CostMatrix();
  for (var y = 0; y < 50; ++y) {
    for (var x = 0; x < 50; ++x) {
      if (!this.wallOrAdjacentToExit(x, y, roomName)) {
        costMatrix.set(x, y, 1);
      }
    }
  }
  return costMatrix;
}
module.exports.walkablePixelsForRoom = function walkablePixelsForRoom(roomName) {
  var costMatrix = new PathFinder.CostMatrix();
  var terrain = Game.map.getRoomTerrain(roomName).getRawBuffer();
  for (var y = 0; y < 50; ++y) {
    for (var x = 0; x < 50; ++x) {
      if (!(terrain[y*50+x] & TERRAIN_MASK_WALL)) {
        costMatrix._bits[x*50+y] = 1;
      }
    }
  }
  return costMatrix;
}

module.exports.invertMatrix = function invertMatrix(matrix){
  let cm = new PathFinder.CostMatrix();
  let x,y,v;
  for (y = 0; y < 50; ++y) {
    for (x = 0; x < 50; ++x) {
      v = matrix.get(x, y);
      if(v < 255 && v > 0) v = 254 - v
      cm.set(x, y, v);
    }
  }
  return cm
}

module.exports.getIndexed = function getIndexed(matrix){
  let index = {}
  let x,y,v;
  for (y = 0; y < 50; ++y) {
    for (x = 0; x < 50; ++x) {
      v = matrix.get(x, y);
      index[v] = index[v] || []
      index[v].push({ x,y })
    }
  }
  return index
}
