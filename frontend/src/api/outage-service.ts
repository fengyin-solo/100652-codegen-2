import { outageDb, resetOutageDb, saveOutageDb } from '@/data/outage-store'
import type {
  Addendum,
  AffectedCommunity,
  NoticeDraftInput,
  NoticeStatus,
  OutageDb,
  OutageNotice,
  ServiceResult,
  ServiceTicket,
  WindowRevision,
} from '@/data/outage-types'
import { NOTICE_STATUSES } from '@/data/outage-types'

// 状态只允许逐帧流转：草稿 -> 已发布 -> 已结束，想跨状态操作一律拒绝。
const NEXT_STATUS: Record<NoticeStatus, NoticeStatus | null> = {
  草稿: '已发布',
  已发布: '已结束',
  已结束: null,
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function nowStamp(): string {
  const d = new Date()
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  )
}

/** 兼容 datetime-local(带 T)、不带秒两种写法，统一转成可比较的 Date。 */
export function parseDateTime(value: string): Date | null {
  const text = value.trim()
  if (!text) {
    return null
  }
  const normalized = text.includes('T') ? text : text.replace(' ', 'T')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

/** datetime-local 控件的值（YYYY-MM-DDTHH:mm）与库里格式互转。 */
export function toInputValue(stamp: string): string {
  const date = parseDateTime(stamp)
  if (!date) {
    return ''
  }
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  )
}

export function fromInputValue(value: string): string {
  const date = parseDateTime(value)
  if (!date) {
    return ''
  }
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  )
}

/** 停水时长：8小时10分、45分、1天2小时 这样读给客服看。 */
export function formatDuration(startStamp: string, endStamp: string): string {
  const start = parseDateTime(startStamp)
  const end = parseDateTime(endStamp)
  if (!start || !end || end.getTime() <= start.getTime()) {
    return '—'
  }
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  const parts: string[] = []
  if (days > 0) {
    parts.push(`${days}天`)
  }
  if (hours > 0) {
    parts.push(`${hours}小时`)
  }
  if (mins > 0 || parts.length === 0) {
    parts.push(`${mins}分`)
  }
  return parts.join('')
}

/** 停水时段以最后一版为准：列表页、详情页都从这里取，保证两页读到的完全一致。 */
export function currentWindow(notice: OutageNotice): WindowRevision {
  return notice.windowRevisions[notice.windowRevisions.length - 1]
}

export function windowRange(notice: OutageNotice): string {
  const win = currentWindow(notice)
  return `${win.startAt} ~ ${win.endAt}`
}

export function affectedHouseholds(notice: OutageNotice): number {
  return notice.scope.reduce((sum, item) => sum + item.households, 0)
}

function getDb(): OutageDb {
  return outageDb()
}

function persist(db: OutageDb): void {
  saveOutageDb(clone(db))
}

export function listNotices(): OutageNotice[] {
  return clone(getDb().notices).sort((a, b) => a.id - b.id)
}

export function getNotice(id: number): OutageNotice | null {
  const found = getDb().notices.find((item) => item.id === id)
  return found ? clone(found) : null
}

function findCodeDuplicate(db: OutageDb, code: string, excludeId?: number): OutageNotice | undefined {
  return db.notices.find((item) => item.outageCode === code && item.id !== excludeId)
}

function validateWindow(startAt: string, endAt: string): string {
  const start = parseDateTime(startAt)
  const end = parseDateTime(endAt)
  if (!start || !end) {
    return '停水开始、结束时间必须填全'
  }
  if (end.getTime() <= start.getTime()) {
    return '停水结束时间必须晚于开始时间'
  }
  return ''
}

/** 影响范围逐小区校验；草稿允许范围为空（发布时才拦），但列出的小区信息必须完整。 */
function validateScope(scope: NoticeDraftInput['scope'], allowEmpty: boolean): string {
  if (scope.length === 0) {
    return allowEmpty ? '' : '影响小区为空，不许发布：请先按小区落影响范围'
  }
  const names = new Set<string>()
  for (const item of scope) {
    const name = item.community.trim()
    if (!name) {
      return '影响范围里存在未填写的小区名称'
    }
    if (names.has(name)) {
      return `影响小区「${name}」重复登记，请合并为一条`
    }
    names.add(name)
    if (item.channels.length === 0) {
      return `小区「${name}」还没勾选通知渠道`
    }
    if (!Number.isFinite(item.households) || item.households <= 0) {
      return `小区「${name}」的影响户数必须大于 0`
    }
  }
  return ''
}

function validateDraftInput(db: OutageDb, input: NoticeDraftInput, excludeId?: number): string {
  const code = input.outageCode.trim()
  if (!code) {
    return '停水编号必须填写'
  }
  if (findCodeDuplicate(db, code, excludeId)) {
    return `停水编号「${code}」已发布/登记过，同一编号不许重复发布`
  }
  if (!input.title.trim()) {
    return '通知标题必须填写'
  }
  if (!input.area.trim()) {
    return '停水片区必须填写'
  }
  const windowError = validateWindow(input.startAt, input.endAt)
  if (windowError) {
    return windowError
  }
  const scopeError = validateScope(input.scope, true)
  return scopeError
}

function buildScopeRows(noticeId: number, scope: NoticeDraftInput['scope']): AffectedCommunity[] {
  return scope.map((item, index) => ({
    id: `s${noticeId}-${Date.now()}-${index}`,
    community: item.community.trim(),
    channels: [...item.channels],
    households: Math.floor(item.households),
  }))
}

export function createNotice(input: NoticeDraftInput): ServiceResult<{ id: number }> {
  const db = getDb()
  const error = validateDraftInput(db, input)
  if (error) {
    return { ok: false, message: error }
  }
  const id = db.noticeSeq + 1
  const stamp = nowStamp()
  const notice: OutageNotice = {
    id,
    outageCode: input.outageCode.trim(),
    title: input.title.trim(),
    area: input.area.trim(),
    reason: input.reason.trim(),
    status: '草稿',
    scope: buildScopeRows(id, input.scope),
    windowRevisions: [
      {
        version: 1,
        startAt: fromInputValue(input.startAt),
        endAt: fromInputValue(input.endAt),
        reason: input.windowReason.trim() || '初版停水时段',
        changedAt: stamp,
      },
    ],
    addenda: [],
    publishState: 'none',
    publishError: '',
    publishedAt: null,
    endedAt: null,
    createdAt: stamp,
    updatedAt: stamp,
  }
  db.noticeSeq = id
  db.notices.push(notice)
  persist(db)
  return { ok: true, message: '停水通知草稿已创建', data: { id } }
}

/** 只有草稿能改通知正文与影响范围；已发布的走到 addAddendum，那里只许追加。 */
export function updateDraft(id: number, input: NoticeDraftInput): ServiceResult {
  const db = getDb()
  const index = db.notices.findIndex((item) => item.id === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的停水通知` }
  }
  const notice = db.notices[index]
  if (notice.status !== '草稿') {
    return { ok: false, message: `${notice.status}的通知不许再改停水时段与影响范围，只能追加补充说明` }
  }
  const error = validateDraftInput(db, input, id)
  if (error) {
    return { ok: false, message: error }
  }

  const stamp = nowStamp()
  const startAt = fromInputValue(input.startAt)
  const endAt = fromInputValue(input.endAt)
  const win = currentWindow(notice)
  // 时段改动时追加一版，以最后一版为准；只改其他字段不产生新版本。
  if (win.startAt !== startAt || win.endAt !== endAt) {
    notice.windowRevisions.push({
      version: notice.windowRevisions.length + 1,
      startAt,
      endAt,
      reason: input.windowReason.trim() || '停水时段调整，以最后一版为准',
      changedAt: stamp,
    })
  }

  notice.outageCode = input.outageCode.trim()
  notice.title = input.title.trim()
  notice.area = input.area.trim()
  notice.reason = input.reason.trim()
  notice.scope = buildScopeRows(id, input.scope)
  notice.updatedAt = stamp
  db.notices[index] = notice
  persist(db)
  return { ok: true, message: '草稿已更新' }
}

/**
 * 发布事务：先复核已落库的影响范围，再置为已发布，最后同事务驱动客服诉求清单重排。
 * 渠道下发失败时不改状态，保留失败标记与原因，界面可以原样重试。
 */
function doPublish(db: OutageDb, notice: OutageNotice, simulateFailure: boolean): ServiceResult {
  if (notice.status !== '草稿') {
    return { ok: false, message: `当前是「${notice.status}」，只有草稿能发布，状态不许跳级` }
  }
  const duplicate = findCodeDuplicate(db, notice.outageCode, notice.id)
  if (duplicate) {
    return { ok: false, message: `停水编号「${notice.outageCode}」在另一张通知里已登记，不许重复发布` }
  }
  const win = currentWindow(notice)
  const windowError = validateWindow(win.startAt, win.endAt)
  if (windowError) {
    return { ok: false, message: windowError }
  }
  // 发布前再读一遍库里的影响范围：没落库的范围一律不认。
  const scopeError = validateScope(
    notice.scope.map((item) => ({ community: item.community, channels: item.channels, households: item.households })),
    false,
  )
  if (scopeError) {
    return { ok: false, message: scopeError }
  }

  if (simulateFailure) {
    notice.publishState = 'failed'
    notice.publishError = '短信网关/电话外呼平台下发超时，影响范围已落库但通知未发出，可重试发布。'
    notice.updatedAt = nowStamp()
    persist(db)
    return { ok: false, retryable: true, message: notice.publishError }
  }

  const stamp = nowStamp()
  notice.status = '已发布'
  notice.publishState = 'none'
  notice.publishError = ''
  if (!notice.publishedAt) {
    notice.publishedAt = stamp
  }
  notice.updatedAt = stamp
  reorderTickets(db, notice.id, stamp)
  persist(db)
  return { ok: true, message: '通知已发布，客服诉求清单已按影响范围重排' }
}

export function publishNotice(id: number, simulateFailure = false): ServiceResult {
  const db = getDb()
  const notice = db.notices.find((item) => item.id === id)
  if (!notice) {
    return { ok: false, message: `没有找到编号为 ${id} 的停水通知` }
  }
  return doPublish(db, notice, simulateFailure)
}

/** 发布失败后的重试：沿用已落库的影响范围，不再改动任何通知内容。 */
export function retryPublish(id: number, simulateFailure = false): ServiceResult {
  const db = getDb()
  const notice = db.notices.find((item) => item.id === id)
  if (!notice) {
    return { ok: false, message: `没有找到编号为 ${id} 的停水通知` }
  }
  if (notice.status !== '草稿') {
    return { ok: false, message: `通知已是「${notice.status}」，无需重试发布` }
  }
  if (notice.publishState !== 'failed') {
    // 没有失败标记也允许直接走发布，保持入口幂等。
    return doPublish(db, notice, simulateFailure)
  }
  return doPublish(db, notice, simulateFailure)
}

export function endNotice(id: number): ServiceResult {
  const db = getDb()
  const notice = db.notices.find((item) => item.id === id)
  if (!notice) {
    return { ok: false, message: `没有找到编号为 ${id} 的停水通知` }
  }
  if (NEXT_STATUS[notice.status] !== '已结束') {
    return { ok: false, message: `只有「已发布」的通知能结束，当前「${notice.status}」不许跳级` }
  }
  const stamp = nowStamp()
  notice.status = '已结束'
  notice.endedAt = stamp
  notice.updatedAt = stamp
  // 停水结束后受影响小区的诉求不再置顶，清单再排一次。
  reorderTickets(db, notice.id, stamp)
  persist(db)
  return { ok: true, message: '通知已结束，客服诉求清单已重新排序' }
}

/** 已发布/已结束的通知只许追加补充说明，历史条目原样保留。 */
export function addAddendum(id: number, content: string): ServiceResult<{ addendum: Addendum }> {
  const db = getDb()
  const notice = db.notices.find((item) => item.id === id)
  if (!notice) {
    return { ok: false, message: `没有找到编号为 ${id} 的停水通知` }
  }
  if (notice.status === '草稿') {
    return { ok: false, message: '草稿通知请直接编辑正文，发布后才使用补充说明' }
  }
  const text = content.trim()
  if (!text) {
    return { ok: false, message: '补充说明内容不能为空' }
  }
  const addendum: Addendum = {
    id: `a${id}-${Date.now()}`,
    content: text,
    createdAt: nowStamp(),
  }
  notice.addenda.push(addendum)
  notice.updatedAt = addendum.createdAt
  persist(db)
  return { ok: true, message: '补充说明已追加', data: { addendum: clone(addendum) } }
}

/**
 * 客服诉求清单重排：
 * 1) 未办结且小区落在「已发布」停水范围内的诉求置顶；
 * 2) 其余未办结诉求居中；3) 已办结沉底。关联编号一并写库，客服一眼能对上通知。
 */
function reorderTickets(db: OutageDb, driverNoticeId: number, stamp: string): void {
  const active = db.notices.filter((item) => item.status === '已发布')
  const communityToNotice = new Map<string, OutageNotice>()
  for (const notice of active) {
    const win = currentWindow(notice)
    for (const item of notice.scope) {
      const existing = communityToNotice.get(item.community)
      if (!existing) {
        communityToNotice.set(item.community, notice)
        continue
      }
      // 同一小区同时受多张通知影响时，停水更早开始的那张优先关联。
      const existingWin = currentWindow(existing)
      if (win.startAt < existingWin.startAt) {
        communityToNotice.set(item.community, notice)
      }
    }
  }

  for (const ticket of db.tickets) {
    const linked = ticket.status !== '已办结' ? communityToNotice.get(ticket.community) : undefined
    if (linked) {
      ticket.linkedNoticeId = linked.id
      ticket.priority = 1
    } else if (ticket.status === '已办结') {
      ticket.priority = 3
    } else {
      ticket.linkedNoticeId = null
      ticket.priority = 2
    }
  }
  db.reorderVersion += 1
  db.lastReorderAt = stamp
  db.lastReorderNoticeId = driverNoticeId
}

/** 清单按重排后的优先级读：置顶组按停水开始时间再按受理时间，普通组按受理时间，办结沉底。 */
export function listTickets(): ServiceTicket[] {
  const db = getDb()
  const windowStartOf = (ticket: ServiceTicket): string => {
    if (ticket.linkedNoticeId === null) {
      return ''
    }
    const notice = db.notices.find((item) => item.id === ticket.linkedNoticeId)
    return notice ? currentWindow(notice).startAt : ''
  }
  return clone(db.tickets).sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority
    }
    if (a.priority === 1) {
      const ws = windowStartOf(a).localeCompare(windowStartOf(b))
      if (ws !== 0) {
        return ws
      }
    }
    if (a.priority === 3) {
      const received = b.receivedAt.localeCompare(a.receivedAt)
      if (received !== 0) {
        return received
      }
    } else {
      const received = a.receivedAt.localeCompare(b.receivedAt)
      if (received !== 0) {
        return received
      }
    }
    return a.id - b.id
  })
}

export function reorderInfo(): { version: number; at: string | null; noticeId: number | null } {
  const db = getDb()
  return { version: db.reorderVersion, at: db.lastReorderAt, noticeId: db.lastReorderNoticeId }
}

export interface NoticeStats {
  draft: number
  published: number
  ended: number
  publishFailed: number
  affectedHouseholds: number
  urgentTickets: number
}

export function noticeStats(): NoticeStats {
  const db = getDb()
  return {
    draft: db.notices.filter((item) => item.status === '草稿').length,
    published: db.notices.filter((item) => item.status === '已发布').length,
    ended: db.notices.filter((item) => item.status === '已结束').length,
    publishFailed: db.notices.filter((item) => item.publishState === 'failed').length,
    affectedHouseholds: db.notices
      .filter((item) => item.status === '已发布')
      .reduce((sum, item) => sum + affectedHouseholds(item), 0),
    urgentTickets: db.tickets.filter((item) => item.priority === 1 && item.status !== '已办结').length,
  }
}

export function statusIndex(status: NoticeStatus): number {
  return NOTICE_STATUSES.indexOf(status)
}

export function resetOutageData(): void {
  resetOutageDb()
}
