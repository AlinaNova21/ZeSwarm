import { kernel } from '../kernel'
import find from 'lodash/find'
import '../Traveler'

if (Game.shard.name === 'shard2') {
  kernel.createProcess('PowerCreepManager', PowerCreepManager)
}

function * PowerCreepManager () {
  const opCnt = 19
  const ops = []
  for (let i = 0; i < opCnt; i++) {
    ops.push(`opGen${i}`)
  }
  while (true) {
    if (!this.hasThread('sellOps')) {
      this.createThread('sellOps', SellOps)
    }
    for (const op of ops) {
      if (!this.hasThread(`maintainer:${op}`)) {
        this.createThread(`maintainer:${op}`, OpGenMantainer, op)
      }
      // yield true
    }
    yield
  }
}

function * OpGenMantainer (name) {
  const powers = [PWR_GENERATE_OPS,PWR_OPERATE_SPAWN,PWR_GENERATE_OPS]
  let fleePos
  while (true) {
    if (!Game.powerCreeps[name]) {
      PowerCreep.create(name, POWER_CLASS.OPERATOR)
      yield
      continue
    }
    const pc = Game.powerCreeps[name]
    if (!(pc.spawnCooldownTime > Date.now()) && !pc.shard) {
      const powerSpawn = find(Game.rooms, r => r.powerSpawn && r.powerSpawn.my).powerSpawn
      pc.spawn(powerSpawn);
      yield
      continue
    }
    if (!pc.room) {
      yield
      continue
    }
    if (!fleePos) {
      fleePos = flee(pc.room.powerSpawn, pc.room.find(FIND_STRUCTURES).map(s => ({ pos: s.pos, range: 6 })))
      fleePos.x += Math.floor(Math.random() * 4) - 2
      fleePos.y += Math.floor(Math.random() * 4) - 2
    } else {
      pc.room.visual.circle(fleePos, { fill: 'red', opacity: 0.3 })
    }
    if (pc.level < powers.length) {
      pc.upgrade(powers[pc.level])
    }
    if (!pc.room.controller.isPowerEnabled) {
      pc.say('🔓 EN PWR 🔓')
      if (!pc.pos.isNearTo(pc.room.controller)) {
        pc.moveTo(pc.room.controller)
      } else {
        pc.enableRoom(pc.room.controller)
      }
      yield
      continue
    }
    if (pc.powers[PWR_GENERATE_OPS] && !pc.powers[PWR_GENERATE_OPS].cooldown) {
      pc.usePower(PWR_GENERATE_OPS)
      pc.say('⚙️ Ops ⚙️', true)
    }
    if (pc.ticksToLive < 100) {
      if (pc.pos.isNearTo(pc.room.powerSpawn)) {
        pc.renew(pc.room.powerSpawn)
      } else {
        pc.moveTo(pc.room.powerSpawn, { reusePath: 20 })
      }
      yield
      continue
    }
    if (pc.store.getFreeCapacity() < 50) {
      if (pc.pos.isNearTo(pc.room.terminal)) {
        pc.transfer(pc.room.terminal, RESOURCE_OPS)
      } else {
        pc.moveTo(pc.room.terminal, { reusePath: 20 })
      }
    } else {
      const tombstones = pc.room.find(FIND_TOMBSTONES).filter(t => t.store[RESOURCE_OPS])
      if (tombstones.length) {
        const ts = pc.pos.findClosestByRange(tombstones)
        if (pc.pos.isNearTo(ts)) {
          pc.withdraw(ts, RESOURCE_OPS)
        } else {
          pc.moveTo(ts)
        }
        yield
        continue
      }
      if (!pc.pos.inRangeTo(fleePos, 4)) {
        pc.moveTo(fleePos)
      }
    }
    yield
  }
}

function flee(creep, targets) {
  const { path } = PathFinder.search(creep.pos, targets, {
    flee: true,
    roomCallback(room) {
      const cm = new PathFinder.CostMatrix()
      for (let i = 0; i < 2500; i++) {
        cm._bits[i] = 0
      }
      const r = Game.rooms[room]
      if (r) {
        const terrain = r.getTerrain()
        for (let y = 0; y < 50; y++) {
          for (let x = 0; x < 50; x++) {
            const t = terrain.get(x,y)
            if (t & TERRAIN_MASK_WALL) {
              cm.set(x, y, 255)
            }
          }
        }
        r.find(FIND_STRUCTURES).forEach(({ structureType, pos: { x, y } }) => {
          if (OBSTACLE_OBJECT_TYPES.includes(structureType)) {
            cm.set(x, y, 254)
          }
        })
      }
      return cm
    }
  })
  if (path && path.length) {
    return path.pop()
    // creep.moveByPath(path)
  }
}

function * SellOps() {
  while (true) {
    const orders = Game.market.getAllOrders({ type: ORDER_BUY, resourceType: RESOURCE_OPS })
    for (const room of Object.values(Game.rooms)) {
      if (!room.terminal || !room.terminal.my) continue
      let amt = room.terminal.store[RESOURCE_OPS] || 0
      if (!amt) continue
      const sorted = _.sortBy(orders, o => o.price)
      const order = sorted.pop()
      if (order) {
        Game.market.deal(order.id, Math.min(order.amount, amt), room.name)
      }
    }
    yield
  }
}