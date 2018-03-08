const RUN_TEST_ALL = false
const RUN_TEST_INT = false
const RUN_TEST_SLEEPER = false
const RUN_TEST_BASE = false
const RUN_TEST_CRON = false
const RUN_TEST_SPAWN = true

const RUN_CRONS = true
const RUN_LEGACY = true
const RUN_PROCESS_TREE_DUMP = true

const STRESS_TEST_ENABLED = false
const STRESS_TEST_PROC = 'ags131/SleeperTest'
const STRESS_TEST_CNT = 0
const STRESS_TEST_SERVICES = _.times(STRESS_TEST_CNT, (i) => ({
  id: `stress_${i}`,
  name: STRESS_TEST_PROC,
  params: {},
  restart: true,
  enabled: STRESS_TEST_ENABLED
}))

export default {
  services: [
    ...STRESS_TEST_SERVICES,
    {
      id: 'cron',
      name: 'cron',
      params: {},
      restart: true,
      enabled: RUN_CRONS
    },
    {
      id: 'swarm',
      name: 'swarm',
      params: {},
      restart: true,
      enabled: true
    },
    {
      id: 'spawnManager',
      name: 'spawn/manager',
      params: {},
      restart: true,
      enabled: true
    },
    {
      id: 'legacy',
      name: 'legacy',
      params: {},
      restart: true,
      enabled: RUN_LEGACY
    },
    {
      id: 'processTreeDump',
      name: 'processTreeDump',
      params: {},
      restart: true,
      enabled: RUN_PROCESS_TREE_DUMP
    },
    {
      id: 'intTest',
      name: 'intTest',
      params: {},
      restart: true,
      enabled: RUN_TEST_ALL || RUN_TEST_INT
    },
    {
      id: 'sleeperTest',
      name: 'ags131/SleeperTest',
      params: {},
      restart: true,
      enabled: RUN_TEST_ALL || RUN_TEST_SLEEPER
    },
    {
      id: 'cronTest',
      name: 'ags131/CronTest',
      params: {},
      restart: true,
      enabled: RUN_TEST_ALL || RUN_TEST_CRON
    },
    {
      id: 'spawnTest',
      name: 'ags131/SpawnTest',
      params: {},
      restart: true,
      enabled: RUN_TEST_ALL || RUN_TEST_SPAWN
    },
    {
      id: 'baseTest',
      name: 'POSISTest/PosisBaseTestProcess',
      params: { maxRunTime: 5 },
      restart: true,
      enabled: RUN_TEST_ALL || RUN_TEST_BASE
    }
  ]
}
