/** 停水通知与影响范围发布模块的领域类型与示例数据。 */

export type NoticeStatus = '草稿' | '已发布' | '已结束'

/** 通知渠道：城东片区来电问得最多的就是「走哪个渠道通知」，逐小区固定下来。 */
export const NOTICE_CHANNELS = ['短信通知', '电话外呼', '社区公告栏', '微信公众号', '上门通知'] as const

export const NOTICE_STATUSES: NoticeStatus[] = ['草稿', '已发布', '已结束']

/** 单个受影响小区：停水时段可以精确到小区，回答「哪个小区停多久」。 */
export type AffectedCommunity = {
  community: string
  startTime: string // datetime-local：YYYY-MM-DDTHH:mm
  endTime: string
  channels: string[]
}

/** 已发布通知只许追加的补充说明，只增不改。 */
export type Supplement = {
  at: string
  text: string
  operator: string
}

export type OutageNotice = {
  id: number
  outageNo: string // 停水编号
  area: string // 所属片区
  reason: string // 停水原因
  startTime: string // 通知级停水时段（权威值，改动以最后一版为准）
  endTime: string
  windowVersion: number // 停水时段版本，每改一次 +1
  communities: AffectedCommunity[] // 影响小区，逐个排列展示
  supplements: Supplement[]
  status: NoticeStatus
  scopePersisted: boolean // 影响范围是否已落库
  publishError: string // 最近一次发布失败原因，空串表示无
  publishedAt: string
  endedAt: string
  createdAt: string
  updatedAt: string
}

/**
 * 影响范围落库记录：发布动作必须先把影响范围快照写到这里，再走通知渠道。
 * 渠道失败时快照保留，重试直接复用，发布成功后置 published。
 */
export type ImpactScope = {
  id: number
  noticeId: number
  outageNo: string
  windowVersion: number
  noticeStartTime: string
  noticeEndTime: string
  communities: AffectedCommunity[] // 落库时的快照副本
  persistedAt: string
  publishAttempts: number
  published: boolean
}

export type TicketStatus = '待受理' | '处理中' | '已办结'

/** 客服受理的诉求（来电）清单：发布动作会把命中影响小区的未办结诉求顶到最前。 */
export type ServiceTicket = {
  id: number
  ticketNo: string
  community: string
  caller: string
  summary: string
  receivedAt: string
  status: TicketStatus
  boostSeq: number // 置顶序号，越大越靠前；0 表示从未被发布动作命中
  linkedOutageNo: string
  reorderReason: string
}

export type WaterMeta = {
  reorderSeq: number // 每次成功发布 +1，作为诉求重排的置顶序号
  channelHealthy: boolean // 通知渠道是否正常（演示发布失败/重试用）
}

const now = () => new Date()

function stamp(d: Date): string {
  const p = (v: number) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export const SEED_NOTICES: OutageNotice[] = [
  {
    id: 2,
    outageNo: 'TS-20261007-02',
    area: '城东片区',
    reason: '城东大道供水管网碰口施工',
    startTime: '2026-10-07T22:00',
    endTime: '2026-10-08T06:00',
    windowVersion: 1,
    communities: [
      { community: '晨光小区', startTime: '2026-10-07T22:00', endTime: '2026-10-08T06:00', channels: ['短信通知', '电话外呼', '社区公告栏'] },
      { community: '城东公寓', startTime: '2026-10-07T22:00', endTime: '2026-10-08T06:00', channels: ['短信通知', '微信公众号'] },
      { community: '锦绣江南', startTime: '2026-10-07T23:00', endTime: '2026-10-08T05:30', channels: ['电话外呼', '上门通知'] },
    ],
    supplements: [
      { at: '2026-10-06 15:20', text: '锦绣江南老人住户较多，电话外呼未接通的改由社区网格员上门告知。', operator: '值班管理员' },
    ],
    status: '已发布',
    scopePersisted: true,
    publishError: '',
    publishedAt: '2026-10-06 10:05',
    endedAt: '',
    createdAt: '2026-10-05 16:40',
    updatedAt: '2026-10-06 15:20',
  },
  {
    id: 1,
    outageNo: 'TS-20261008-01',
    area: '城东片区',
    reason: '城东片区主干管迁改接拢',
    startTime: '2026-10-08T09:00',
    endTime: '2026-10-08T18:00',
    windowVersion: 2,
    communities: [
      { community: '锦江花园', startTime: '2026-10-08T09:00', endTime: '2026-10-08T18:00', channels: ['短信通知', '电话外呼'] },
      { community: '东方明珠苑', startTime: '2026-10-08T09:00', endTime: '2026-10-08T15:00', channels: ['短信通知', '社区公告栏'] },
      { community: '滨江壹号', startTime: '2026-10-08T13:00', endTime: '2026-10-08T18:00', channels: ['微信公众号', '短信通知'] },
    ],
    supplements: [],
    status: '草稿',
    scopePersisted: false,
    publishError: '',
    publishedAt: '',
    endedAt: '',
    createdAt: '2026-10-06 09:12',
    updatedAt: '2026-10-07 08:30',
  },
  {
    id: 3,
    outageNo: 'TS-20260928-01',
    area: '城南片区',
    reason: '城南加压泵站水表改造',
    startTime: '2026-09-28T08:30',
    endTime: '2026-09-28T12:00',
    windowVersion: 1,
    communities: [
      { community: '南河新村', startTime: '2026-09-28T08:30', endTime: '2026-09-28T12:00', channels: ['短信通知', '社区公告栏'] },
    ],
    supplements: [],
    status: '已结束',
    scopePersisted: true,
    publishError: '',
    publishedAt: '2026-09-26 14:00',
    endedAt: '2026-09-28 12:05',
    createdAt: '2026-09-25 10:00',
    updatedAt: '2026-09-28 12:05',
  },
  {
    id: 4,
    outageNo: 'TS-20261009-01',
    area: '城东片区',
    reason: '城东二支路阀门更换（影响小区待核实）',
    startTime: '2026-10-09T09:00',
    endTime: '2026-10-09T12:00',
    windowVersion: 1,
    communities: [], // 影响小区为空：演示「不许发布」
    supplements: [],
    status: '草稿',
    scopePersisted: false,
    publishError: '',
    publishedAt: '',
    endedAt: '',
    createdAt: '2026-10-07 09:00',
    updatedAt: '2026-10-07 09:00',
  },
]

export const SEED_SCOPES: ImpactScope[] = [
  {
    id: 1,
    noticeId: 2,
    outageNo: 'TS-20261007-02',
    windowVersion: 1,
    noticeStartTime: '2026-10-07T22:00',
    noticeEndTime: '2026-10-08T06:00',
    communities: [
      { community: '晨光小区', startTime: '2026-10-07T22:00', endTime: '2026-10-08T06:00', channels: ['短信通知', '电话外呼', '社区公告栏'] },
      { community: '城东公寓', startTime: '2026-10-07T22:00', endTime: '2026-10-08T06:00', channels: ['短信通知', '微信公众号'] },
      { community: '锦绣江南', startTime: '2026-10-07T23:00', endTime: '2026-10-08T05:30', channels: ['电话外呼', '上门通知'] },
    ],
    persistedAt: '2026-10-06 10:04',
    publishAttempts: 1,
    published: true,
  },
]

export const SEED_TICKETS: ServiceTicket[] = [
  { id: 1, ticketNo: 'HL-20261006-001', community: '晨光小区', caller: '王女士', summary: '来电询问今晚停水是否属实，提前储水要准备多久', receivedAt: '2026-10-06 09:10', status: '待受理', boostSeq: 1, linkedOutageNo: 'TS-20261007-02', reorderReason: '命中已发布停水通知 TS-20261007-02 的影响范围' },
  { id: 2, ticketNo: 'HL-20261006-002', community: '锦绣江南', caller: '陈先生', summary: '小区老人多，要求确认电话外呼名单，担心漏通知', receivedAt: '2026-10-06 10:02', status: '待受理', boostSeq: 1, linkedOutageNo: 'TS-20261007-02', reorderReason: '命中已发布停水通知 TS-20261007-02 的影响范围' },
  { id: 3, ticketNo: 'HL-20261006-005', community: '城东公寓', caller: '刘女士', summary: '公众号推送打不开，要求短信补发停水时段', receivedAt: '2026-10-06 11:20', status: '待受理', boostSeq: 1, linkedOutageNo: 'TS-20261007-02', reorderReason: '命中已发布停水通知 TS-20261007-02 的影响范围' },
  { id: 4, ticketNo: 'HL-20261006-006', community: '滨江壹号', caller: '赵先生', summary: '看到群里转发明天停水的消息，核实是否覆盖本小区', receivedAt: '2026-10-06 15:00', status: '待受理', boostSeq: 0, linkedOutageNo: '', reorderReason: '' },
  { id: 5, ticketNo: 'HL-20261005-014', community: '城西花园', caller: '孙女士', summary: '家中水压偏小，已派单排查立管', receivedAt: '2026-10-05 08:30', status: '处理中', boostSeq: 0, linkedOutageNo: '', reorderReason: '' },
  { id: 6, ticketNo: 'HL-20261004-009', community: '晨光小区', caller: '周先生', summary: '上次停水后复水发黄，已答复放水处理', receivedAt: '2026-10-04 14:00', status: '已办结', boostSeq: 0, linkedOutageNo: '', reorderReason: '' },
]

export const SEED_WATER_META: WaterMeta = {
  reorderSeq: 1,
  channelHealthy: true,
}

export { now as seedNow, stamp }
