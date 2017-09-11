class Controller {
  run(controller){
    let { level, room } = controller
    let offGrid = [STRUCTURE_CONTAINER,STRUCTURE_ROAD]
    let wanted = [STRUCTURE_TOWER, STRUCTURE_EXTENSION, STRUCTURE_STORAGE]
    let want = _.mapValues(_.pick(CONTROLLER_STRUCTURES,wanted),level)
    let allSites = room.find(FIND_MY_CONSTRUCTION_SITES)
    let sites = _.groupBy(allSites,'structureType')
    let have = _.mapValues(room.structures,'length')
    if(level > 1) {
      want[STRUCTURE_CONTAINER] = Math.min(level, CONTROLLER_STRUCTURES[STRUCTURE_CONTAINER][level])
      // want[STRUCTURE_ROAD] = Math.floor(_.sum(have) *  0.70)
    }
    for (let type in want) {
      let amount = want[type] - ((have[type] || 0) + (sites[type] || []).length)
      // console.log(type,want[type],have[type] || 0, (sites[type] || []).length)
      if (amount <= 0) continue
      console.log(type,offGrid.includes(type))
      let positions = [
        ...allSites,
        ...room.structures.all,
        ...room.find(FIND_EXIT),
        ...room.find(FIND_SOURCES)
      ].map(this.getRange)
      let pos = this.findPos(controller.pos, positions, offGrid.includes(type))
      if(pos){
        let ret = room.createConstructionSite(pos,type)
        return
      }
    }
    return
    let invert = false
    /**/
    for(let x = 0; x < 50; x++) {
      for(let y = 0; y < 50; y++) {
        let grid = x % 2 != y % 2
        if(invert) grid = !grid
        let v = grid && x > 2 && x < 48 && y > 2 && y < 48
        if(!v) room.visual.rect(x-0.5,y-0.5,1,1,{ fill: 'red' })
      }
    }
    /**/
    invert = true
    for(let x = 0; x < 50; x++) {
      for(let y = 0; y < 50; y++) {
        let grid = x % 2 != y % 2
        if(invert) grid = !grid
        let v = grid && x > 2 && x < 48 && y > 2 && y < 48
        if(!v) room.visual.rect(x-0.5,y-0.5,1,1,{ fill: 'orange' })
      }
    }
    /**/
  }

  getRange(s){
    let range = 1
    let { pos, x, y, roomName } = s
    if(!pos) pos = { x, y, roomName }
    switch(s.structureType){
      case 'exit':
      case 'controller':
        range = 4
      case 'source':
        range = 3
    }
    return { pos, range }
  }

  findPos(origin,avoid,invert=false){
    console.log('findPos',invert,origin,avoid)
    let result = PathFinder.search(origin,avoid,{ 
      flee: true,
      roomCallback(room){
        let cm = new PathFinder.CostMatrix() 
        for(let x = 0; x < 50; x++) {
          for(let y = 0; y < 50; y++) {
            let grid = x % 2 === y % 2
            if(x == y && x == 30) console.log(x,y,grid,invert)
            if(invert) grid = !grid
            if(x == y && x == 30) console.log(x,y,grid,invert)
            let v = grid && x > 2 && x < 48 && y > 2 && y < 48
            if(!v) cm.set(x,y,255)
          }
        }
        return cm
      } 
    })
    if(result && result.path.length){
      return result.path.slice(-1)[0]
    }
  }
}

module.exports = Controller