## Example rpc call

=== Shard0 ===
shard0 { rpc: { req: {}, res: {} }
shard1 { rpc: { req: {}, res: {} }
const rpc = new InterShardRPC('shard1')
rpc.call('ping')
shard0 { rpc: { req: { someid: ['shard1', 'ping', []] } }, res: {} }

=== shard1 ===
shard0 { rpc: { req: { someid: ['shard1', 'ping', []] } }, res: {} }
shard1 { rpc: { req: {}, res: {} }
runs ping
shard1 { rpc: { req: {}, res: { someid: { shard: 'shard0', result: 'pong' } } } }

=== shard0 ===
shard0 { rpc: { req: { someid: ['shard1', 'ping', []] } }, res: {} }
shard1 { rpc: { req: {}, res: { someid: { shard: 'shard0', result: 'pong' } } } }
returns 'pong', clear request
shard0 { rpc: { req: {}, res: {} }

=== shard1 ===
shard0 { rpc: { req: {}, res: {} }
shard1 { rpc: { req: {}, res: { someid: { shard: 'shard0', result: 'pong' } } } }
clears response since req is gone
shard1 { rpc: { req: {}, res: {} }
