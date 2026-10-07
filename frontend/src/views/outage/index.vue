<template>
  <section class="page" data-module="outage">
    <header class="page-head">
      <div>
        <h2>停水通知与影响范围发布</h2>
        <p class="page-desc">
          每次停水开一张通知，停水编号、停水时段与影响小区按小区逐个排列；草稿 → 已发布 →
          已结束逐级流转，发布时按影响范围重排客服诉求清单。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">新建停水通知</button>
        <button class="btn" type="button" @click="resetData">恢复示例数据</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
      <span v-if="failedCount" class="legend-item legend-fail">发布失败待重试：{{ failedCount }}</span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>停水编号 / 标题 / 片区</span>
        <input v-model.trim="keyword" placeholder="按编号、标题、片区检索" />
      </label>
      <label class="filter-item">
        <span>影响小区</span>
        <input v-model.trim="communityKeyword" placeholder="按小区名检索" />
      </label>
      <label class="filter-item">
        <span>通知状态</span>
        <select v-model="statusFilter">
          <option value="">全部</option>
          <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <p v-if="actionMessage" :class="actionOk ? 'ok-text' : 'error-text'" class="action-msg">
      {{ actionMessage }}
    </p>

    <table class="data-table notice-table">
      <thead>
        <tr>
          <th style="width: 150px">停水编号</th>
          <th>通知 / 片区</th>
          <th style="width: 250px">停水时段（最后一版）</th>
          <th>影响小区逐个排列</th>
          <th style="width: 180px">状态与动作</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="notice in filteredNotices" :key="notice.id">
          <tr :class="{ 'row-failed': notice.publishState === 'failed' }">
            <td rowspan="2" class="cell-code">
              <RouterLink :to="`/outage/${notice.id}`" class="link strong">{{ notice.outageCode }}</RouterLink>
              <span class="cell-sub">v{{ currentWindow(notice).version }} 时段</span>
            </td>
            <td rowspan="2">
              <RouterLink :to="`/outage/${notice.id}`" class="notice-title">{{ notice.title }}</RouterLink>
              <span class="cell-sub">{{ notice.area }} · {{ affectedHouseholds(notice) }} 户</span>
            </td>
            <td rowspan="2">
              <span class="window-range">{{ windowRange(notice) }}</span>
              <span class="cell-sub">停 {{ formatDuration(currentWindow(notice).startAt, currentWindow(notice).endAt) }}</span>
            </td>
            <td class="scope-cell">
              <ul v-if="notice.scope.length" class="scope-lines">
                <li v-for="row in notice.scope" :key="row.id" class="scope-line">
                  <span class="community-name">{{ row.community }}</span>
                  <span class="channel-tags">
                    <i v-for="ch in row.channels" :key="ch" class="channel-tag">{{ ch }}</i>
                  </span>
                  <span class="households">{{ row.households }} 户</span>
                </li>
              </ul>
              <span v-else class="empty-inline">影响范围为空，禁止发布</span>
            </td>
            <td rowspan="2" class="cell-status">
              <span :class="['status-pill', statusClass(notice.status)]">{{ notice.status }}</span>
              <span v-if="notice.publishState === 'failed'" class="fail-flag">发布失败</span>
              <span v-if="notice.addenda.length" class="cell-sub">补充 {{ notice.addenda.length }} 条</span>
              <div class="row-actions vertical">
                <template v-if="notice.status === '草稿'">
                  <button class="link" type="button" @click="openEdit(notice.id)">编辑</button>
                  <button
                    v-if="notice.publishState === 'failed'"
                    class="link strong"
                    type="button"
                    @click="openRetry(notice.id)"
                  >
                    重试发布
                  </button>
                  <button v-else class="link" type="button" @click="openPublish(notice.id)">发布</button>
                </template>
                <template v-else-if="notice.status === '已发布'">
                  <button class="link" type="button" @click="finishNotice(notice.id)">结束停水</button>
                  <RouterLink :to="`/outage/${notice.id}`" class="link">追加补充说明</RouterLink>
                </template>
                <template v-else>
                  <RouterLink :to="`/outage/${notice.id}`" class="link">查看详情</RouterLink>
                </template>
              </div>
            </td>
          </tr>
          <tr :class="{ 'row-failed': notice.publishState === 'failed' }">
            <td class="scope-reason">{{ currentWindow(notice).reason }}</td>
          </tr>
        </template>
        <tr v-if="!filteredNotices.length">
          <td colspan="5" class="empty-state">没有符合条件的停水通知，可新建一张草稿</td>
        </tr>
      </tbody>
    </table>

    <section class="ticket-panel">
      <header class="ticket-head">
        <div>
          <h3>客服受理诉求清单（发布动作驱动重排）</h3>
          <p class="page-desc">
            受影响小区的未办结诉求自动置顶并关联停水通知，其余未办结居中，已办结沉底。
            <span v-if="reorder.at">
              最近重排：第 {{ reorder.version }} 版 · {{ reorder.at }}
              <template v-if="driverNotice">（由 {{ driverNotice.outageCode }} 发布/结束触发）</template>
            </span>
          </p>
        </div>
      </header>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 130px">受理编号</th>
            <th style="width: 90px">来电人</th>
            <th style="width: 120px">所属小区</th>
            <th style="width: 90px">诉求类型</th>
            <th>诉求内容</th>
            <th style="width: 150px">受理时间</th>
            <th style="width: 120px">关联停水</th>
            <th style="width: 80px">状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ticket in tickets" :key="ticket.id" :class="{ 'row-urgent': ticket.priority === 1, 'row-done': ticket.priority === 3 }">
            <td>{{ ticket.serial }}</td>
            <td>{{ ticket.caller }}<span class="cell-sub">{{ ticket.phone }}</span></td>
            <td>{{ ticket.community }}</td>
            <td>{{ ticket.kind }}</td>
            <td>{{ ticket.summary }}</td>
            <td>{{ ticket.receivedAt }}</td>
            <td>
              <RouterLink v-if="ticket.linkedNoticeId" :to="`/outage/${ticket.linkedNoticeId}`" class="link">
                {{ codeOf(ticket.linkedNoticeId) }}
              </RouterLink>
              <span v-else class="muted-text">—</span>
            </td>
            <td>
              <span :class="['ticket-flag', ticket.priority === 1 ? 'flag-urgent' : ticket.priority === 3 ? 'flag-done' : 'flag-normal']">
                {{ ticket.priority === 1 ? '停水置顶' : ticket.status }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <NoticeEditor v-if="editingId !== undefined" :notice-id="editingId" @cancel="editingId = undefined" @saved="onSaved" />
    <PublishDialog
      v-if="publishingNotice"
      :notice="publishingNotice"
      :mode="publishMode"
      @cancel="publishingNotice = null"
      @published="onPublished"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  affectedHouseholds,
  currentWindow,
  formatDuration,
  getNotice,
  listNotices,
  listTickets,
  noticeStats,
  endNotice as endNoticeApi,
  reorderInfo,
  resetOutageData,
  windowRange,
} from '@/api/outage-service'
import { NOTICE_STATUSES } from '@/data/outage-types'
import type { NoticeStatus, OutageNotice, ServiceTicket } from '@/data/outage-types'
import NoticeEditor from './NoticeEditor.vue'
import PublishDialog from './PublishDialog.vue'

const statuses = NOTICE_STATUSES
const notices = ref<OutageNotice[]>([])
const tickets = ref<ServiceTicket[]>([])
const reorder = ref(reorderInfo())

const keyword = ref('')
const communityKeyword = ref('')
const statusFilter = ref<string>('')
const actionMessage = ref('')
const actionOk = ref(true)

const editingId = ref<number | null | undefined>(undefined)
const publishingNotice = ref<OutageNotice | null>(null)
const publishMode = ref<'publish' | 'retry'>('publish')

const stats = computed(() => {
  const s = noticeStats()
  return [
    { label: '草稿通知', value: s.draft },
    { label: '已发布（生效中）', value: s.published },
    { label: '已结束', value: s.ended },
    { label: '发布影响户数', value: s.affectedHouseholds },
    { label: '停水置顶诉求', value: s.urgentTickets },
  ]
})

const failedCount = computed(() => notices.value.filter((item) => item.publishState === 'failed').length)

const statusSummary = computed(() =>
  statuses.map((status) => ({
    status,
    count: notices.value.filter((row) => row.status === status).length,
  })),
)

const filteredNotices = computed(() => {
  const kw = keyword.value.trim()
  const ckw = communityKeyword.value.trim()
  return notices.value.filter((notice) => {
    if (statusFilter.value && notice.status !== (statusFilter.value as NoticeStatus)) {
      return false
    }
    if (kw && ![notice.outageCode, notice.title, notice.area].some((text) => text.includes(kw))) {
      return false
    }
    if (ckw && !notice.scope.some((row) => row.community.includes(ckw))) {
      return false
    }
    return true
  })
})

const driverNotice = computed(() =>
  reorder.value.noticeId === null ? null : notices.value.find((item) => item.id === reorder.value.noticeId) ?? null,
)

function codeOf(id: number | null): string {
  if (id === null) {
    return ''
  }
  return notices.value.find((item) => item.id === id)?.outageCode ?? `#${id}`
}

function statusClass(status: NoticeStatus): string {
  if (status === '已发布') {
    return 'pill-published'
  }
  if (status === '已结束') {
    return 'pill-ended'
  }
  return 'pill-draft'
}

function flash(ok: boolean, message: string) {
  actionOk.value = ok
  actionMessage.value = message
}

function reload() {
  notices.value = listNotices()
  tickets.value = listTickets()
  reorder.value = reorderInfo()
}

function resetFilters() {
  keyword.value = ''
  communityKeyword.value = ''
  statusFilter.value = ''
}

function openCreate() {
  editingId.value = null
}

function openEdit(id: number) {
  editingId.value = id
}

function onSaved() {
  editingId.value = undefined
  reload()
  flash(true, '草稿已保存，可继续补充影响范围后发布')
}

function openPublish(id: number) {
  const notice = getNotice(id)
  if (!notice) {
    return
  }
  publishMode.value = 'publish'
  publishingNotice.value = notice
}

function openRetry(id: number) {
  const notice = getNotice(id)
  if (!notice) {
    return
  }
  publishMode.value = 'retry'
  publishingNotice.value = notice
}

function onPublished() {
  publishingNotice.value = null
  reload()
  flash(true, '发布成功，客服诉求清单已按影响范围重排')
}

function finishNotice(id: number) {
  const result = endNoticeApi(id)
  reload()
  flash(result.ok, result.message)
}

function resetData() {
  resetOutageData()
  reload()
  flash(true, '已恢复停水模块示例数据')
}

onMounted(reload)
</script>
