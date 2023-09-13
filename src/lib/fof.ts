import config from '@/config'

export function isAlly(tgt: AnyOwnedStructure | AnyCreep | string) {
  if (typeof tgt === 'undefined') return false
  const target: string = typeof tgt === 'string' ? tgt : tgt.owner.username
  return config.allies.includes(target.toLowerCase())
}