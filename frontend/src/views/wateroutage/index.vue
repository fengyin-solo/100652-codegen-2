<template>
  <section class="page" data-module="wateroutage">
    <header class="page-head">
      <div>
        <h2>停水通知与影响范围发布</h2>
        <p class="page-desc">每次停水开一张通知：停水编号、停水时段、影响小区逐个排列；发布前影响范围落库，发布动作驱动客服诉求清单重排。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">开具停水通知</button>
        <RouterLink class="btn" to="/wateroutage/tickets">客服诉求清单</RouterLink>
        <button class="btn ghost" type="button" @click="resetData">恢复示例数据</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in summary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
      <span class="legend-item channel-state" :class="{ down: !healthy }">
        通知渠道：{{ healthy ? '正常' : '故障（发布将失败，可重试）' }}
      </span>
      <label class="legend-item switch">
        <input type="checkbox" :checked="healthy" @change="toggleHealthy" />
        模拟渠道{{ healthy ? '故障' : '恢复' }}（演示发布失败/重试）
      </label>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>停水编号</span>
        <input v-model="filters.outageNo" placeholder="按停水编号检索" />
      </label>
      <label class="filter-item">
        <span>所属片区</span>
        <input v-model="filters.area" placeholder="按片区检索" />
      </label>
      <label class="filter-item">
        <span>状态</span>
        <select v-model="filters.status">
          <option value="">全部</option>
          <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>停水编号</th>
          <th>所属片区</th>
          <th>停水时段（最后一版）</th>
          <th>影响小区</th>
          <th>通知渠道</th>
          <th>状态</th>
          <th>发布/落库</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id" :class="{ 'row-failed': row.publishError !== '' }">
          <td>
            <RouterLink class="link strong" :to="`/wateroutage/${row.id}`">{{ row.outageNo }}</RouterLink>
            <div v-if="row.windowVersion > 1" class="sub">时段第 {{ row.windowVersion }} 版</div>
          </td>
          <td>{{ row.area }}</td>
          <td>
            <div>{{ formatWindow(row.startTime, row.endTime) }}</div>
            <div class="sub">共 {{ formatDuration(row.startTime, row.endTime) }}</div>
          </td>
          <td>
            <span v-for="c in row.communities" :key="c.community" class="community-tag">{{ c.community }}</span>
            <span v-if="!row.communities.length" class="error-text">无影响小区（禁发）</span>
          </td>
          <td class="channels-cell">
            <div v-for="c in listCommunities(row)" :key="c.community" class="channel-line">
              <em>{{ c.community }}</em>：{{ channelLabel(c.channels) }}
            </div>
          </td>
          <td><span class="status-badge" :class="`st-${row.status}`">{{ row.status }}</span></td>
          <td>
            <span :class="row.scopePersisted ? 'ok-text' : 'muted-text'">
              {{ row.scopePersisted ? '影响范围已落库' : '未落库' }}
            </span>
            <div v-if="row.publishError" class="error-text sub">发布失败，可重试</div>
          </td>
          <td class="row-actions vertical">
            <RouterLink class="link" :to="`/wateroutage/${row.id}`">详情</RouterLink>
            <button v-if="row.status === '草稿'" class="link" type="button" @click="openEdit(row)">编辑草稿</button>
            <button v-if="row.status === '草稿'" class="link primary-link" type="button" @click="publish(row)">
              {{ row.publishError ? '重试发布' : '发布' }}
            </button>
            <button v-if="row.status === '已发布'" class="link" type="button" @click="close(row)">结束</button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td colspan="8" class="empty-state">暂无停水通知，点击「开具停水通知」新建一张草稿</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 张停水通知</span>
      <span v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</span>
    </footer>

    <NoticeForm ref="formRef" :open="formOpen" :notice="editing" @close="formOpen = false" @submit="saveDraft" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  channelHealthy,
  channelLabel,
  closeNotice,
  createNotice,
  formatDuration,
  formatWindow,
  listCommunities,
  listNotices,
  publishNotice,
  resetWaterData,
  setChannelHealthy,
  statusSummary,
  updateDraft,
} from '@/api/water-outage-service'
import type { OutageNotice } from '@/data/water-outage'
import NoticeForm from './NoticeForm.vue'

const statuses = ['草稿', '已发布', '已结束']
const rows = ref<OutageNotice[]>([])
const total = ref(0)
const message = ref('')
const messageOk = ref(false)
const healthy = ref(channelHealthy())

const filters = ref<{ outageNo: string; area: string; status: string }>({ outageNo: '', area: '', status: '' })
const summary = ref(statusSummary())

const stats = computed(() => [
  { label: '草稿通知', value: rows.value.filter((r) => r.status === '草稿').length },
  { label: '已发布通知', value: rows.value.filter((r) => r.status === '已发布').length },
  { label: '已结束通知', value: rows.value.filter((r) => r.status === '已结束').length },
  { label: '影响小区总数', value: rows.value.reduce((sum, r) => sum + r.communities.length, 0) },
])

const formOpen = ref(false)
const editing = ref<OutageNotice | null>(null)
const formRef = ref<InstanceType<typeof NoticeForm> | null>(null)

function flash(ok: boolean, text: string) {
  messageOk.value = ok
  message.value = text
}

function reload() {
  const payload = listNotices(filters.value)
  rows.value = payload.items
  total.value = payload.total
  summary.value = statusSummary()
  healthy.value = channelHealthy()
}

function resetFilters() {
  filters.value = { outageNo: '', area: '', status: '' }
  reload()
}

function openCreate() {
  editing.value = null
  formOpen.value = true
}

function openEdit(row: OutageNotice) {
  editing.value = row
  formOpen.value = true
}

function saveDraft(payload: { id?: number; input: Parameters<typeof createNotice>[0] }) {
  const result = payload.id
    ? updateDraft(payload.id, payload.input)
    : createNotice(payload.input)
  if (!result.ok) {
    formRef.value?.setError(result.message)
    return
  }
  formOpen.value = false
  reload()
  flash(true, result.message)
}

function publish(row: OutageNotice) {
  const result = publishNotice(row.id)
  reload()
  flash(result.ok, result.message)
}

function close(row: OutageNotice) {
  const result = closeNotice(row.id)
  reload()
  flash(result.ok, result.message)
}

function toggleHealthy(event: Event) {
  const next = (event.target as HTMLInputElement).checked
  setChannelHealthy(next)
  healthy.value = next
}

function resetData() {
  resetWaterData()
  filters.value = { outageNo: '', area: '', status: '' }
  reload()
  flash(true, '已恢复为示例数据')
}

onMounted(reload)
</script>

<style scoped>
.community-tag {
  display: inline-block;
  background: #eef2f7;
  border-radius: 4px;
  padding: 1px 8px;
  margin: 0 4px 4px 0;
  font-size: 12px;
  white-space: nowrap;
}
.channels-cell { min-width: 220px; }
.channel-line { font-size: 12px; line-height: 1.7; }
.channel-line em { font-style: normal; color: var(--muted); }
.sub { font-size: 12px; color: var(--muted); }
.strong { font-weight: 600; }
.primary-link { color: #0f766e; font-weight: 600; }
.row-actions.vertical { flex-direction: column; align-items: flex-start; gap: 4px; }
.row-failed { background: #fef3f2; }
.ok-text { color: #0f766e; }
.muted-text { color: var(--muted); }
.status-badge { border-radius: 999px; padding: 2px 10px; font-size: 12px; }
.st-草稿 { background: #f2f4f7; color: #475467; }
.st-已发布 { background: #dcfae6; color: #027a48; }
.st-已结束 { background: #e9e7f5; color: #5925dc; }
.channel-state.down { background: #fee4e2; color: #b42318; }
.switch { cursor: pointer; }
</style>
