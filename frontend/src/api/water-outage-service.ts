import {
  NOTICE_CHANNELS,
  NOTICE_STATUSES,
  type AffectedCommunity,
  type NoticeStatus,
  type OutageNotice,
  type ServiceTicket,
  stamp,
} from '@/data/water-outage'
import { persistWater, resetWater, waterState } from '@/data/water-store'

// 停水通知模块：所有业务判断都在这一层，列表页/详情页只负责渲染与调用。

export type NoticeDraftInput = {
  outageNo: string
  area: string
  reason: string
  startTime: string
  endTime: string
  communities: AffectedCommunity[]
}

export type NoticeActionResult = {
  ok: boolean
  message: string
  retriable?: boolean // 发布失败时是否可以直接重试（渠道故障 = 可重试）
}

// ---- 展示口径：列表页与详情页共用，保证读到的停水时段完全一致 ----

export function formatDateTime(value: string): string {
  if (!value) return '—'
  return value.replace('T', ' ')
}

export function formatWindow(start: string, end: string): string {
  if (!start || !end) return '—'
  return `${formatDateTime(start)} 至 ${formatDateTime(end)}`
}

/** 停水时长（分钟），起止非法时返回 null。 */
export function durationMinutes(start: string, end: string): number | null {
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null
  return Math.round((e - s) / 60000)
}

export function formatDuration(start: string, end: string): string {
  const mins = durationMinutes(start, end)
  if (mins === null) return '时段有误'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} 分钟`
  if (m === 0) return `${h} 小时`
  return `${h} 小时 ${m} 分`
}

export function channelLabel(list: string[]): string {
  return list.length ? list.join('、') : '—'
}

// ---- 内部工具 ----

function nextId(items: { id: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.id), 0) + 1
}

function normalizeCommunities(rows: AffectedCommunity[]): AffectedCommunity[] {
  return rows
    .map((row) => ({
      community: row.community.trim(),
      startTime: row.startTime,
      endTime: row.endTime,
      channels: [...row.channels],
    }))
    .filter((row) => row.community !== '')
}

/** 通知本体校验：编号、时段、影响小区逐行校验。excludeId 用于编辑时排除自身。 */
function validateDraft(input: NoticeDraftInput, excludeId?: number): string | null {
  if (!input.outageNo.trim()) return '停水编号不能为空'
  if (!input.area.trim()) return '所属片区不能为空'
  if (!input.startTime || !input.endTime) return '停水时段必须填写开始与结束时间'
  if (durationMinutes(input.startTime, input.endTime) === null) {
    return '停水时段不合法：结束时间必须晚于开始时间'
  }
  const duplicate = waterState().notices.find(
    (item) => item.outageNo === input.outageNo.trim() && item.id !== excludeId,
  )
  if (duplicate) {
    return `停水编号「${input.outageNo.trim()}」已用于${duplicate.status}通知，同一停水编号不许重复发布`
  }
  const communities = normalizeCommunities(input.communities)
  if (communities.length === 0) return '影响小区为空的通知不许发布，请至少登记一个受影响小区'
  const names = new Set<string>()
  for (const row of communities) {
    if (names.has(row.community)) return `影响小区「${row.community}」重复登记，请合并为一行`
    names.add(row.community)
    if (!row.startTime || !row.endTime || durationMinutes(row.startTime, row.endTime) === null) {
      return `小区「${row.community}」的停水时段不合法`
    }
    if (row.channels.length === 0) return `小区「${row.community}」至少要选择一条通知渠道`
  }
  return null
}

// ---- 查询 ----

export function listNotices(filters: { outageNo?: string; area?: string; status?: string } = {}): {
  items: OutageNotice[]
  total: number
} {
  const items = [...waterState().notices]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : b.id - a.id))
    .filter((row) => {
      if (filters.outageNo && !row.outageNo.includes(filters.outageNo.trim())) return false
      if (filters.area && !row.area.includes(filters.area.trim())) return false
      if (filters.status && row.status !== filters.status) return false
      return true
    })
  return { items, total: items.length }
}

export function getNotice(id: number): OutageNotice | null {
  return waterState().notices.find((row) => row.id === id) ?? null
}

export function listCommunities(notice: OutageNotice): AffectedCommunity[] {
  // 统一排序口径：按停水开始时间逐个排列，一眼看出先后与时长。
  return [...notice.communities].sort((a, b) => a.startTime.localeCompare(b.startTime))
}

export function statusSummary(): { status: NoticeStatus; count: number }[] {
  return NOTICE_STATUSES.map((status) => ({
    status,
    count: waterState().notices.filter((row) => row.status === status).length,
  }))
}

// ---- 草稿：新建 / 修改（停水时段改动以最后一版为准） ----

export function createNotice(input: NoticeDraftInput, operator = '值班管理员'): NoticeActionResult & { id?: number } {
  const error = validateDraft(input)
  if (error) return { ok: false, message: error }
  const state = waterState()
  const at = stamp(new Date())
  const notice: OutageNotice = {
    id: nextId(state.notices),
    outageNo: input.outageNo.trim(),
    area: input.area.trim(),
    reason: input.reason.trim(),
    startTime: input.startTime,
    endTime: input.endTime,
    windowVersion: 1,
    communities: normalizeCommunities(input.communities),
    supplements: [],
    status: '草稿',
    scopePersisted: false,
    publishError: '',
    publishedAt: '',
    endedAt: '',
    createdAt: at,
    updatedAt: at,
  }
  persistWater({ ...state, notices: [notice, ...state.notices] })
  return { ok: true, message: `停水通知 ${notice.outageNo} 已保存为草稿`, id: notice.id }
}

/** 只允许改草稿；已发布/已结束的影响范围已冻结，只能走追加补充说明。 */
export function updateDraft(id: number, input: NoticeDraftInput): NoticeActionResult {
  const state = waterState()
  const index = state.notices.findIndex((row) => row.id === id)
  if (index < 0) return { ok: false, message: '没有找到这张停水通知' }
  const current = state.notices[index]
  if (current.status !== '草稿') {
    return { ok: false, message: `${current.status}通知的影响范围与停水时段已冻结，只能追加补充说明` }
  }
  const error = validateDraft(input, id)
  if (error) return { ok: false, message: error }
  const windowChanged = current.startTime !== input.startTime || current.endTime !== input.endTime
  const updated: OutageNotice = {
    ...current,
    outageNo: input.outageNo.trim(),
    area: input.area.trim(),
    reason: input.reason.trim(),
    startTime: input.startTime,
    endTime: input.endTime,
    windowVersion: windowChanged ? current.windowVersion + 1 : current.windowVersion,
    communities: normalizeCommunities(input.communities),
    updatedAt: stamp(new Date()),
  }
  const notices = [...state.notices]
  notices[index] = updated
  persistWater({ ...state, notices })
  return {
    ok: true,
    message: windowChanged
      ? `停水时段已更新（第 ${updated.windowVersion} 版），以最后一版为准`
      : '草稿已更新',
  }
}

// ---- 发布：落库 → 通知渠道 → 客服诉求重排，渠道失败可重试 ----

/** 第一步：发布前把影响范围落库。草稿时段又改过则用最后一版重新落库。 */
function persistScope(state: ReturnType<typeof waterState>, notice: OutageNotice): number {
  const existingIndex = state.scopes.findIndex((scope) => scope.noticeId === notice.id)
  const existing = existingIndex >= 0 ? state.scopes[existingIndex] : null
  const scope = existing && existing.windowVersion === notice.windowVersion
    ? { ...existing, published: false }
    : {
        id: existing ? existing.id : nextId(state.scopes),
        noticeId: notice.id,
        outageNo: notice.outageNo,
        windowVersion: notice.windowVersion,
        noticeStartTime: notice.startTime,
        noticeEndTime: notice.endTime,
        communities: JSON.parse(JSON.stringify(notice.communities)) as AffectedCommunity[],
        persistedAt: stamp(new Date()),
        publishAttempts: existing ? existing.publishAttempts : 0,
        published: false,
      }
  const scopes = existingIndex >= 0
    ? state.scopes.map((item, i) => (i === existingIndex ? scope : item))
    : [scope, ...state.scopes]
  persistWater({ ...state, scopes })
  return scope.id
}

/** 第三步：发布成功后重排客服诉求清单，命中本次影响小区的未办结诉求置顶。 */
function reorderTickets(state: ReturnType<typeof waterState>, notice: OutageNotice): number {
  const targets = new Set(notice.communities.map((row) => row.community))
  const seq = state.meta.reorderSeq + 1
  let hit = 0
  const tickets = state.tickets.map((ticket) => {
    if (ticket.status === '已办结' || !targets.has(ticket.community)) return ticket
    hit += 1
    return {
      ...ticket,
      boostSeq: seq,
      linkedOutageNo: notice.outageNo,
      reorderReason: `命中已发布停水通知 ${notice.outageNo} 的影响范围，客服优先受理`,
    }
  })
  persistWater({ ...state, meta: { ...state.meta, reorderSeq: seq }, tickets })
  return hit
}

export function publishNotice(id: number): NoticeActionResult {
  const state = waterState()
  const index = state.notices.findIndex((row) => row.id === id)
  if (index < 0) return { ok: false, message: '没有找到这张停水通知' }
  const notice = state.notices[index]

  // 状态不许跳级：只能从草稿走到已发布。
  if (notice.status === '已发布') return { ok: false, message: '通知已发布，不能重复发布' }
  if (notice.status === '已结束') return { ok: false, message: '通知已结束，不能重新发布' }

  // 发布前校验（含影响小区为空、编号重复、时段/渠道合法性）。
  const error = validateDraft(
    {
      outageNo: notice.outageNo,
      area: notice.area,
      reason: notice.reason,
      startTime: notice.startTime,
      endTime: notice.endTime,
      communities: notice.communities,
    },
    notice.id,
  )
  if (error) return { ok: false, message: error }

  // 第一步：影响范围先落库，落库成功才允许走渠道。
  persistScope(state, notice)

  const withScope = waterState()
  const scopeIndex = withScope.scopes.findIndex((scope) => scope.noticeId === notice.id)
  const scope = withScope.scopes[scopeIndex]
  const attempted = {
    ...scope,
    publishAttempts: scope.publishAttempts + 1,
  }
  const afterAttempt = {
    ...withScope,
    scopes: withScope.scopes.map((item, i) => (i === scopeIndex ? attempted : item)),
  }

  // 第二步：通知渠道下发。渠道故障时通知仍是草稿，落库保留，允许重试。
  if (!afterAttempt.meta.channelHealthy) {
    const failedNotice: OutageNotice = {
      ...notice,
      scopePersisted: true,
      publishError: '通知渠道下发失败：渠道暂不可用，影响范围已落库，可稍后重试发布',
      updatedAt: stamp(new Date()),
    }
    persistWater({
      ...afterAttempt,
      notices: afterAttempt.notices.map((item) => (item.id === notice.id ? failedNotice : item)),
    })
    return { ok: false, retriable: true, message: failedNotice.publishError }
  }

  // 渠道成功：通知置为已发布，落库快照置 published。
  const at = stamp(new Date())
  const published: OutageNotice = {
    ...notice,
    status: '已发布',
    scopePersisted: true,
    publishError: '',
    publishedAt: notice.publishedAt || at,
    updatedAt: at,
  }
  const publishedScopes = afterAttempt.scopes.map((item) =>
    item.noticeId === notice.id ? { ...item, published: true } : item,
  )
  const beforeReorder = {
    ...afterAttempt,
    notices: afterAttempt.notices.map((item) => (item.id === notice.id ? published : item)),
    scopes: publishedScopes,
  }
  persistWater(beforeReorder)

  // 第三步：驱动客服受理的诉求清单重排。
  const hit = reorderTickets(waterState(), published)
  return { ok: true, message: `通知已发布，影响范围已落库；客服诉求清单已重排，${hit} 条未办结诉求已置顶` }
}

/** 已发布 → 已结束，不能从草稿直接结束。 */
export function closeNotice(id: number): NoticeActionResult {
  const state = waterState()
  const index = state.notices.findIndex((row) => row.id === id)
  if (index < 0) return { ok: false, message: '没有找到这张停水通知' }
  const notice = state.notices[index]
  if (notice.status === '草稿') return { ok: false, message: '草稿不能直接结束：状态不许跳级，请先发布' }
  if (notice.status === '已结束') return { ok: false, message: '通知已经是「已结束」' }
  const at = stamp(new Date())
  const updated: OutageNotice = { ...notice, status: '已结束', endedAt: at, updatedAt: at }
  persistWater({
    ...state,
    notices: state.notices.map((item) => (item.id === id ? updated : item)),
  })
  return { ok: true, message: `通知 ${notice.outageNo} 已结束` }
}

// ---- 已发布之后：只许追加补充说明，不许把影响小区改小 ----

export function addSupplement(id: number, text: string, operator = '值班管理员'): NoticeActionResult {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, message: '补充说明内容不能为空' }
  const state = waterState()
  const index = state.notices.findIndex((row) => row.id === id)
  if (index < 0) return { ok: false, message: '没有找到这张停水通知' }
  const notice = state.notices[index]
  if (notice.status === '草稿') return { ok: false, message: '草稿请直接修改正文，无需追加补充说明' }
  const updated: OutageNotice = {
    ...notice,
    supplements: [...notice.supplements, { at: stamp(new Date()), text: trimmed, operator }],
    updatedAt: stamp(new Date()),
  }
  persistWater({ ...state, notices: state.notices.map((item, i) => (i === index ? updated : item)) })
  return { ok: true, message: '补充说明已追加（历史说明不可修改）' }
}

// ---- 影响范围落库查询（详情页展示落库时间与快照） ----

export function getScope(noticeId: number) {
  return waterState().scopes.find((scope) => scope.noticeId === noticeId) ?? null
}

// ---- 客服诉求清单 ----

const TICKET_FLOW: Record<ServiceTicket['status'], ServiceTicket['status'] | null> = {
  待受理: '处理中',
  处理中: '已办结',
  已办结: null,
}

/** 重排后的诉求清单：置顶序号大者优先，其次按来电时间先到先办；已办结沉底。 */
export function listTickets(): ServiceTicket[] {
  return [...waterState().tickets].sort((a, b) => {
    const rank = (s: ServiceTicket['status']) => (s === '已办结' ? 1 : 0)
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status)
    if (a.boostSeq !== b.boostSeq) return b.boostSeq - a.boostSeq
    return a.receivedAt.localeCompare(b.receivedAt)
  })
}

export function advanceTicket(id: number): NoticeActionResult {
  const state = waterState()
  const ticket = state.tickets.find((item) => item.id === id)
  if (!ticket) return { ok: false, message: '没有找到这条诉求' }
  const target = TICKET_FLOW[ticket.status]
  if (!target) return { ok: false, message: '诉求已办结，无需继续流转' }
  persistWater({
    ...state,
    tickets: state.tickets.map((item) => (item.id === id ? { ...item, status: target } : item)),
  })
  return { ok: true, message: `诉求已流转为「${target}」` }
}

// ---- 通知渠道开关：演示发布失败与重试 ----

export function channelHealthy(): boolean {
  return waterState().meta.channelHealthy
}

export function setChannelHealthy(healthy: boolean): void {
  const state = waterState()
  persistWater({ ...state, meta: { ...state.meta, channelHealthy: healthy } })
}

export function resetWaterData(): void {
  resetWater()
}
