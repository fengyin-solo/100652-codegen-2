import { SEED_OUTAGE_DB } from './outage-seed'
import type { OutageDb } from './outage-types'

// 停水模块本地持久化：与通用条目分库存放，避免互相污染。
const STORAGE_KEY = 'waterworks-ops:outage-notices'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): OutageDb {
  const fallback = clone(SEED_OUTAGE_DB)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    // 浅合并：旧缓存里缺的表用示例数据补上，老浏览器升级后不至于白屏。
    const parsed = JSON.parse(raw) as Partial<OutageDb>
    return { ...fallback, ...parsed }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: OutageDb | null = null

export function outageDb(): OutageDb {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function saveOutageDb(db: OutageDb): void {
  cache = db
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  }
}

export function resetOutageDb(): OutageDb {
  const db = clone(SEED_OUTAGE_DB)
  saveOutageDb(db)
  return db
}
