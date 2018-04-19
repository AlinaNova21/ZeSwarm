
var database = {
  userIndex: [],
  allianceindex: []
}

var database_rooms = false
var database_user_rooms = false
var database_user_gcl = false

var StaticIntel = function(database) {
    this.segment_users = false
    this.segment_alliances = false
    this.database = database;
    this.processSegment()
}

StaticIntel.prototype.segment_user = 'LeagueOfAutomatedNations'
StaticIntel.prototype.segment_id = 99

StaticIntel.prototype.processSegment = function () {
  if(!!this.segmentTime) {
    // Not likely to happen due to global resets, but will act as future
    // proofing for when global resets go away.
    if(Game.time - this.segmentTime <= 500) {
      return
    }
  }

  if(!RawMemory.foreignSegment || !RawMemory.foreignSegment.username) {
    return
  }
  var segobject = RawMemory.foreignSegment
  if(segobject.username.toLowerCase() != this.segment_user.toLowerCase()) {
    return
  }

  if(segobject.id != this.segment_id) {
    return
  }

  try {
    var segdata = JSON.parse(segobject.data)
  } catch (err) {
    return
  }

  this.segmentTime = Game.time
  this.segment_alliances = segdata
  this.segment_users = {}
  for(var alliance in segdata) {
    for(var member of segdata[alliance]) {
      this.segment_users[member] = alliance
    }
  }
}

StaticIntel.prototype.getAge = function () {
  if(!this.database || this.database.tick) {
    return Infinity
  }
  return Game.time - this.database.tick
}

StaticIntel.prototype.getRoomInfo = function(room) {
    room = this.getEncodingFromRoomName(room)

    if(!this.database.rooms) {
      if(!!database_rooms) {
        this.database.rooms = JSON.parse(database_rooms)
      } else {
        this.database.rooms = {}
      }
    }

    if(!this.database.rooms[room]) {
        return false
    }

    if(typeof this.database.rooms[room] == 'string') {
      var _location = this.database.rooms[room].indexOf('_')
      if(_location < 0) {
        this.database.rooms[room] = {'u':this.database.rooms[room], 'l':0}
      } else {
        var userid = this.database.rooms[room].substring(0,_location)
        var level = this.database.rooms[room].substring(_location+1)
        this.database.rooms[room] = {'u':userid,'l':level}
      }
    }

    if(!!this.database.rooms[room].u && !this.database.rooms[room].username) {
        username = this.getUserByIndex(this.database.rooms[room].u);
        this.database.rooms[room].username = username;
    }
    return this.database.rooms[room];
}

StaticIntel.prototype.getUserByIndex = function(userindex) {
    if(!this.database.userIndex[userindex]) {
        return false;
    }
    return this.database.userIndex[userindex];
}

StaticIntel.prototype.getIndexByUser = function(user) {
    var index = this.database.userIndex.indexOf(user);
    if(index == -1) {
        return false;
    }
    return index;
}

StaticIntel.prototype.getAllianceByIndex = function(allianceindex) {
    if(!this.database.allianceIndex[allianceindex]) {
        return false;
    }
    return this.database.allianceIndex[allianceindex];
}

StaticIntel.prototype.getIndexByAlliance = function(alliance) {
    let index = this.database.allianceIndex.indexOf(alliance);
    if(index == -1) {
        return false;
    }
    return index;
}

StaticIntel.prototype.getUserGCL = function(user) {

    if(!this.database.gcl) {
      if(!!database_user_gcl) {
        this.database.gcl = JSON.parse(database_user_gcl)
      } else {
        this.database.gcl = {}
      }
    }

    let userindex = this.getIndexByUser(user);
    if(userindex === false || !this.database.gcl[userindex]) {
        return false;
    }
    return this.database.gcl[userindex]
}

StaticIntel.prototype.getUserAlliance = function(user) {
    this.processSegment()
    if(!!this.segment_users) {
      if(!!this.segment_users[user]) {
        return this.segment_users[user]
      }
      return false
    }

    let userindex = this.getIndexByUser(user);
    if (userindex === false || !this.database.users[userindex]) {
      return false;
    }
    return this.getAllianceByIndex(this.database.users[userindex]);
}

StaticIntel.prototype.getUserRooms = function(user) {

    if(!this.database.user_rooms) {
      if(!!database_user_rooms) {
        this.database.user_rooms = JSON.parse(database_user_rooms)
      } else {
        this.database.user_rooms = {}
      }
    }

    let userindex = this.getIndexByUser(user);
    if(userindex === false || !this.database.user_rooms[userindex]) {
        return false
    }
    return this.database.user_rooms[userindex].map(this.getRoomFromEncoding);
}

StaticIntel.prototype.getUsersInAlliance = function(alliance) {
    this.processSegment()
    if(!!this.segment_alliances) {
      if(!!this.segment_alliances[alliance]) {
        return this.segment_users[alliance]
      }
      return false
    }

    let allianceIndex = this.getIndexByAlliance(alliance);
    if(allianceIndex === false || !this.database.alliances[allianceIndex]) {
        return [];
    }

    let members = [];
    for(let userindex of this.database.alliances[allianceIndex].m) {
        members.push(this.getUserByIndex(userindex));
    }
    return members;
}

StaticIntel.prototype.getRoomsInAlliance = function(alliance) {
    let allianceIndex = this.getIndexByAlliance(alliance);
    if(allianceIndex === false || !this.database.alliances[allianceIndex]) {
        return [];
    }

    let rooms = [];
    for(let userindex of this.database.alliances[allianceIndex].m) {
        var user_rooms = this.getUserRooms(this.getUserByIndex(userindex))
        if (user_rooms) {
            rooms = rooms.concat(user_rooms)
        }
    }
    return rooms;
}

StaticIntel.prototype.getRoomFromEncoding = function(roomencoding) {
  var quadrant = parseInt(roomencoding.substring(0,1))
  var x = roomencoding.codePointAt(1)-200
  var y = roomencoding.codePointAt(2)-200
  switch (quadrant) {
    case 1:
      return 'E' + x + 'N' + y
    case 2:
      return 'E' + x + 'S' + y
    case 3:
      return 'W' + x + 'S' + y
    case 4:
      return 'W' + x + 'N' + y
    default:
        return 'sim'
  }
}

StaticIntel.prototype.getEncodingFromRoomName = function(roomname) {
  var roomTokens = /^([WE])([0-9]+)([NS])([0-9]+)$/.exec(roomname);
  if(roomTokens[1] == 'E') {
    if(roomTokens[3] == 'N') {
      var quadrant = 1
    } else {
      var quadrant = 2
    }
  } else {
    if(roomTokens[3] == 'S') {
      var quadrant = 3
    } else {
      var quadrant = 4
    }
  }
  var x = String.fromCharCode(+roomTokens[2]+200)
  var y = String.fromCharCode(+roomTokens[4]+200)
  return quadrant + x + y
}


module.exports = new StaticIntel(database);

