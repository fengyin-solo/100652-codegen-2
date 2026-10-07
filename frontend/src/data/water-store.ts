import {
  SEED_NOTICES,
  SEED_SCOPES,
  SEED_TICKETS,
  SEED_WATER_META,
  type ImpactScope,
  type OutageNotice,
  type ServiceTicket,
  type WaterMeta,
} from '@/data/water-outage'

// 停水通知模块的独立持久化：与通用 entries 分库，互不影响。
const STORE_KEY = 'waterworks-ops:water-outage'

type WaterStoreShape = {
  notices: OutageNotice[]
  scopes: ImpactScope[]
  tickets: ServiceTicket[]
  meta: WaterMeta
}

const SEED: WaterStoreShape = {
  notices: SEED_NOTICES,
  scopes: SEED_SCOPES,
  tickets: SEED_TICKETS,
  meta: { ...SEED_WATER_META },
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

let cache: WaterStoreShape | null = null

function readStorage(): WaterStoreShape {
  if (typeof window === 'undefined' || !window.localStorage) {
    return clone(SEED)
  }
  const raw = window.localStorage.getItem(STORE_KEY)
  if (!raw) {
    const seeded = clone(SEED)
    window.localStorage.setItem(STORE_KEY, JSON.stringify(seeded))
    return seeded
  }
  try {
    const parsed = JSON.parse(raw) as Partial<WaterStoreShape>
    // 字段兜底：旧版本数据缺新字段时回示例值补齐。
    return {
      notices: parsed.notices ?? clone(SEED).notices,
      scopes: parsed.scopes ?? [],
      tickets: parsed.tickets ?? clone(SEED).tickets,
      meta: { ...clone(SEED).meta, ...(parsed.meta ?? {}) },
    }
  } catch {
    const seeded = clone(SEED)
    window.localStorage.setItem(STORE_KEY, JSON.stringify(seeded))
    return seeded
  }
}

export function waterState(): WaterStoreShape {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function persistWater(state: WaterStoreShape): void {
  cache = state
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(state))
  }
}

export function resetWater(): WaterStoreShape {
  const seeded = clone(SEED)
  persistWater(seeded)
  return seeded
}

export function waterStorageKey(): string {
  return STORE_KEY
}
