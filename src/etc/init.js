export default {
  services: [
    {
      id: 'legacy',
      name: 'legacy',
      params: {},
      restart: true,
      enabled: true
    },
    {
      id: 'intTest',
      name: 'intTest',
      params: {},
      restart: true,
      enabled: true
    },
    {
      id: 'sleeperTest',
      name: 'ags131/SleeperTest',
      params: {},
      restart: true,
      enabled: true
    },
    {
      id: 'baseTest',
      name: 'POSISTest/PosisBaseTestProcess',
      params: { maxRunTime: 5 },
      restart: true,
      enabled: true
    }
  ]
}
