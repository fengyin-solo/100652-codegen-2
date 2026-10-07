import { resetOutageData } from '@/api/outage-service'
import {
  addAddendum,
  createNotice,
  endNotice,
  getNotice,
  listNotices,
  listTickets,
  noticeStats,
  publishNotice,
  reorderInfo,
  retryPublish,
  updateDraft,
  currentWindow,
} from '@/api/outage-service'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.error(`  ✗ ${name} ${extra}`)
  }
}

resetOutageData()

// 1. 影响小区为空的通知不许发布
let r = createNotice({
  outageCode: 'TS-TEST-EMPTY', title: '空范围测试', area: '测试片区', reason: '',
  startAt: '2026-10-20T08:00', endAt: '2026-10-20T12:00', windowReason: '', scope: [],
})
check('空范围草稿可创建', r.ok && r.data?.id === 5)
r = publishNotice(5)
check('空范围禁止发布', !r.ok && r.message.includes('影响小区为空'))
check('禁止发布后仍是草稿', getNotice(5)?.status === '草稿')

// 2. 同一停水编号不许重复发布
r = createNotice({
  outageCode: 'TS-20261007-01', title: '重复编号', area: '城东片区', reason: '',
  startAt: '2026-10-20T08:00', endAt: '2026-10-20T12:00', windowReason: '',
  scope: [{ community: '某小区', channels: ['短信'], households: 10 }],
})
check('重复停水编号创建被拒', !r.ok && r.message.includes('不许重复发布'))

// 3. 把空范围补全；渠道未选/户数非法拦截
r = updateDraft(5, {
  outageCode: 'TS-TEST-EMPTY', title: '空范围测试', area: '测试片区', reason: '',
  startAt: '2026-10-20T08:00', endAt: '2026-10-20T12:00', windowReason: '',
  scope: [{ community: '测试小区', channels: [], households: 10 }],
})
check('渠道未选禁止保存', !r.ok && r.message.includes('通知渠道'))
r = updateDraft(5, {
  outageCode: 'TS-TEST-EMPTY', title: '空范围测试', area: '测试片区', reason: '',
  startAt: '2026-10-20T08:00', endAt: '2026-10-20T12:00', windowReason: '',
  scope: [{ community: '测试小区', channels: ['短信'], households: 0 }],
})
check('户数为0禁止保存', !r.ok && r.message.includes('影响户数'))
r = updateDraft(5, {
  outageCode: 'TS-TEST-EMPTY', title: '空范围测试', area: '测试片区', reason: '',
  startAt: '2026-10-20T08:00', endAt: '2026-10-20T12:00', windowReason: '',
  scope: [
    { community: '测试小区', channels: ['短信', '公众号'], households: 10 },
    { community: '晨光小区', channels: ['社区公告'], households: 20 },
  ],
})
check('补全范围后保存成功', r.ok)

// 4. 时段改动以最后一版为准，且留版本
r = updateDraft(5, {
  outageCode: 'TS-TEST-EMPTY', title: '空范围测试', area: '测试片区', reason: '',
  startAt: '2026-10-20T08:00', endAt: '2026-10-20T15:00', windowReason: '延长3小时',
  scope: [
    { community: '测试小区', channels: ['短信', '公众号'], households: 10 },
    { community: '晨光小区', channels: ['社区公告'], households: 20 },
  ],
})
check('时段修改成功', r.ok)
const n5 = getNotice(5)!
check('时段保留两版', n5.windowRevisions.length === 2)
check('最后一版为15:00', currentWindow(n5).endAt === '2026-10-20 15:00')
check('列表页与详情页同源一致', listNotices().find((x) => x.id === 5)!.windowRevisions[1].endAt === getNotice(5)!.windowRevisions[1].endAt)

// 5. 结束时间早于开始时间拦截
r = updateDraft(5, {
  outageCode: 'TS-TEST-EMPTY', title: '空范围测试', area: '测试片区', reason: '',
  startAt: '2026-10-20T18:00', endAt: '2026-10-20T15:00', windowReason: '',
  scope: [{ community: '测试小区', channels: ['短信'], households: 10 }],
})
check('结束早于开始被拒', !r.ok && r.message.includes('晚于开始'))

// 6. 状态不许跳级：草稿不能直接结束
r = endNotice(5)
check('草稿直接结束被拒（不许跳级）', !r.ok && r.message.includes('不许跳级'))

// 7. 发布失败可重试；失败不动状态、不落重排
const beforeVersion = reorderInfo().version
r = publishNotice(5, true)
check('模拟发布失败返回 retryable', !r.ok && r.retryable === true)
check('失败后仍为草稿', getNotice(5)?.status === '草稿')
check('失败后有失败标记', getNotice(5)?.publishState === 'failed')
check('失败不驱动重排', reorderInfo().version === beforeVersion)
r = retryPublish(5, false)
check('重试发布成功', r.ok && r.message.includes('重排'))
check('成功后为已发布', getNotice(5)?.status === '已发布')
check('成功后清除失败标记', getNotice(5)?.publishState === 'none')
check('成功发布驱动重排（版本+1）', reorderInfo().version === beforeVersion + 1)

// 8. 重排效果：晨光小区（未办结）应置顶并关联5号通知；已办结不置顶
const tickets = listTickets()
const chenguang = tickets.find((t) => t.serial === 'CS-20261007-007')!
check('受影响小区诉求置顶', chenguang.priority === 1 && chenguang.linkedNoticeId === 5)
check('置顶组排在办结组之前', tickets.findIndex((t) => t.priority === 1) < tickets.findIndex((t) => t.priority === 3))

// 9. 已发布通知不许改小影响范围/改时段，只许追加
r = updateDraft(5, {
  outageCode: 'TS-TEST-EMPTY', title: '改标题试试', area: '测试片区', reason: '',
  startAt: '2026-10-20T08:00', endAt: '2026-10-20T12:00', windowReason: '',
  scope: [{ community: '测试小区', channels: ['短信'], households: 10 }],
})
check('已发布通知编辑被拒（范围不可改小）', !r.ok && r.message.includes('只能追加补充说明'))
const afterBlocked = getNotice(5)!
check('被拒后范围与标题均未变', afterBlocked.scope.length === 2 && afterBlocked.title === '空范围测试')
r = addAddendum(5, '追加一条临时取水点说明')
check('已发布可追加补充说明', r.ok && getNotice(5)?.addenda.length === 1)
check('原补充说明内容保留', getNotice(5)?.addenda[0].content.includes('临时取水点'))
r = addAddendum(5, '   ')
check('空补充说明被拒', !r.ok)

// 10. 已发布 → 已结束，结束后再次驱动重排，置顶取消
r = endNotice(5)
check('已发布可结束', r.ok && getNotice(5)?.status === '已结束')
r = endNotice(5)
check('已结束不能再结束', !r.ok)
const chenguang2 = listTickets().find((t) => t.serial === 'CS-20261007-007')!
check('停水结束后诉求取消置顶', chenguang2.priority === 2 && chenguang2.linkedNoticeId === null)

// 11. 种子数据：已发布通知1号的时段取最后一版 06:00
const n1 = getNotice(1)!
check('种子通知时段以最后一版为准', currentWindow(n1).endAt === '2026-10-08 06:00')
check('城东花园诉求初始置顶关联1号', listTickets().find((t) => t.serial === 'CS-20261007-001')!.linkedNoticeId === 1)

const s = noticeStats()
check('统计口径正确', s.draft === 2 && s.published === 1 && s.ended === 2)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
