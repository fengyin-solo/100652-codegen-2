/** 停水通知与影响范围发布模块的领域模型：纯前端落库，结构对齐后端接口，换回后端时页面不用改。 */

// 通知状态只允许线性流转：草稿 -> 已发布 -> 已结束，不许跳级。
export type NoticeStatus = '草稿' | '已发布' | '已结束'

// 发布失败不是一个独立状态：通知仍停留在草稿，置失败标记，可原样重试发布。
export type PublishState = 'none' | 'failed'

export type NotifyChannel = '短信' | '电话外呼' | '社区公告' | '公众号' | '上门告知'

export type TicketStatus = '待受理' | '处理中' | '已办结'

export const NOTICE_STATUSES: NoticeStatus[] = ['草稿', '已发布', '已结束']

export const NOTIFY_CHANNELS: NotifyChannel[] = ['短信', '电话外呼', '社区公告', '公众号', '上门告知']

export const TICKET_STATUSES: TicketStatus[] = ['待受理', '处理中', '已办结']

/** 影响小区：影响范围按小区逐个落库，发布前就必须写进库里。 */
export interface AffectedCommunity {
  id: string
  community: string
  channels: NotifyChannel[]
  households: number
}

/** 停水时段版本：同一停水编号的时段可以反复改，永远以最后一版为准，历史版本留痕。 */
export interface WindowRevision {
  version: number
  startAt: string
  endAt: string
  reason: string
  changedAt: string
}

/** 补充说明：已发布的通知只许追加，既有的说明不许改、不许删。 */
export interface Addendum {
  id: string
  content: string
  createdAt: string
}

export interface OutageNotice {
  id: number
  outageCode: string
  title: string
  area: string
  reason: string
  status: NoticeStatus
  scope: AffectedCommunity[]
  windowRevisions: WindowRevision[]
  addenda: Addendum[]
  publishState: PublishState
  publishError: string
  publishedAt: string | null
  endedAt: string | null
  createdAt: string
  updatedAt: string
}

/** 客服受理诉求：发布动作会驱动这份清单重排，受影响小区的未办结诉求置顶。 */
export interface ServiceTicket {
  id: number
  serial: string
  caller: string
  phone: string
  community: string
  kind: string
  summary: string
  receivedAt: string
  status: TicketStatus
  linkedNoticeId: number | null
  priority: number
}

/** 草稿表单提交给服务层的结构。 */
export interface NoticeDraftInput {
  outageCode: string
  title: string
  area: string
  reason: string
  startAt: string
  endAt: string
  windowReason: string
  scope: Array<Pick<AffectedCommunity, 'community' | 'channels' | 'households'>>
}

export interface OutageDb {
  noticeSeq: number
  ticketSeq: number
  notices: OutageNotice[]
  tickets: ServiceTicket[]
  reorderVersion: number
  lastReorderAt: string | null
  lastReorderNoticeId: number | null
}

export interface ServiceResult<T = null> {
  ok: boolean
  message: string
  retryable?: boolean
  data?: T
}
