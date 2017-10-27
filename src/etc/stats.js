export default {
  driver: 'Graphite', // Or `InfluxDB
  format: 'plain', // Or JSON, only applies to Graphite driver
  types: ['memory', 'segment', 'console'], // memory, segment, console (the agent limits memory and segment to 15 second poll intervals)
  key: '__stats',
  segment: 30,
  baseStats: true,
  measureMemoryParse: true,
  usermap: { // use module.user in console to get userID for mapping. Defaults to username of Spawn1 if not defined
    // '577bc02e47c3ef7031adb268': 'ags131',
  }
}
