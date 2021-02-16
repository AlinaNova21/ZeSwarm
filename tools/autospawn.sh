#!/bin/bash
SRV=./spawn_srv
# rm -rfv $SRV
# mkdir -p $SRV
pushd $SRV
cat - <<EOF > config.yml
mods:
- screepsmod-auth
- screepsmod-admin-utils
processors: 4
runnerCnt: 1
bots:
  bot: ../dist/
serverConfig:
  map: blank
  tickRate: 1
  shardName: autospawn
EOF
touch yarn.lock
screeps-launcher &
SLPID=$!
popd
node tools/autospawn.js $@
kill $SLPID