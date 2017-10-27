const RUN_TEST_ALL = false
const RUN_TEST_INT = false
const RUN_TEST_SLEEPER = false
const RUN_TEST_BASE = false
const RUN_TEST_CRON = false

const RUN_CRONS = true
const RUN_LEGACY = true

export default {
  services: [
    {
      id: 'cron',
      name: 'cron',
      params: {},
      restart: true,
      enabled: RUN_CRONS
    },
    {
      id: 'legacy',
      name: 'legacy',
      params: {},
      restart: true,
      enabled: RUN_LEGACY
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
      id: 'baseTest',
      name: 'POSISTest/PosisBaseTestProcess',
      params: { maxRunTime: 5 },
      restart: true,
      enabled: RUN_TEST_ALL || RUN_TEST_BASE
    }
  ]
}
