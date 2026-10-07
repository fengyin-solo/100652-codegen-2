<template>
  <section class="page" data-module="outage-detail">
    <p v-if="!notice" class="error-text">找不到这张停水通知，可能已被重置。<RouterLink to="/outage" class="link">返回列表</RouterLink></p>

    <template v-else>
      <header class="page-head">
        <div>
          <p class="back-line"><RouterLink to="/outage" class="link">← 返回停水通知列表</RouterLink></p>
          <h2>{{ notice.title }}</h2>
          <p class="page-desc">{{ notice.outageCode }} · {{ notice.area }}</p>
        </div>
        <div class="page-actions">
          <template v-if="notice.status === '草稿'">
            <button class="btn" type="button" @click="editing = true">编辑草稿</button>
            <button v-if="notice.publishState === 'failed'" class="btn primary" type="button" @click="startRetry">
              重试发布
            </button>
            <button v-else class="btn primary" type="button" @click="startPublish">发布</button>
          </template>
          <button v-if="notice.status === '已发布'" class="btn primary" type="button" @click="finish">结束停水</button>
        </div>
      </header>

      <p v-if="actionMessage" :class="actionOk ? 'ok-text' : 'error-text'" class="action-msg">{{ actionMessage }}</p>

      <ol class="status-steps">
        <li
          v-for="(step, index) in statusSteps"
          :key="step.status"
          :class="{
            'step-active': index <= currentStep,
            'step-current': index === currentStep,
            'step-blocked': index === currentStep + 1 && notice.status === '草稿' && notice.publishState === 'failed',
          }"
        >
          <span class="step-dot">{{ index + 1 }}</span>
          <span class="step-label">{{ step.status }}</span>
          <span class="step-time">{{ step.time }}</span>
        </li>
      </ol>

      <div v-if="notice.publishState === 'failed'" class="fail-banner">
        上次发布失败：{{ notice.publishError }}
        <button class="link strong" type="button" @click="startRetry">立即重试发布</button>
      </div>

      <section class="detail-card">
        <h3>停水时段（以最后一版为准）</h3>
        <p class="window-hero">
          <strong>{{ windowRange(notice) }}</strong>
          <span class="duration-badge">停水 {{ durationText }}</span>
          <span class="muted-text">当前采用 v{{ win?.version }}（{{ win?.changedAt }}）</span>
        </p>
        <p class="reason-text">{{ notice.reason || '未填写停水事由' }}</p>
        <table v-if="notice.windowRevisions.length > 1" class="data-table revision-table">
          <thead>
            <tr><th>版本</th><th>开始时间</th><th>复水时间</th><th>时长</th><th>调整说明</th><th>变更时间</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="rev in [...notice.windowRevisions].reverse()"
              :key="rev.version"
              :class="{ 'rev-current': win !== null && rev.version === win.version }"
            >
              <td>v{{ rev.version }}<span v-if="win !== null && rev.version === win.version" class="cell-sub">当前</span></td>
              <td>{{ rev.startAt }}</td>
              <td>{{ rev.endAt }}</td>
              <td>{{ formatDuration(rev.startAt, rev.endAt) }}</td>
              <td>{{ rev.reason }}</td>
              <td>{{ rev.changedAt }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="detail-card">
        <div class="card-head">
          <h3>影响范围（按小区逐个排列）</h3>
          <span v-if="notice.status !== '草稿'" class="lock-hint">已发布，范围已锁定，不可改小</span>
          <span v-else-if="!notice.scope.length" class="lock-hint warn">范围为空，禁止发布</span>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 60px">序号</th>
              <th>影响小区</th>
              <th>通知渠道</th>
              <th style="width: 120px">影响户数</th>
              <th style="width: 110px">该小区停水时长</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in notice.scope" :key="row.id">
              <td>{{ index + 1 }}</td>
              <td><strong>{{ row.community }}</strong></td>
              <td>
                <span class="channel-tags">
                  <i v-for="ch in row.channels" :key="ch" class="channel-tag">{{ ch }}</i>
                </span>
              </td>
              <td>{{ row.households }} 户</td>
              <td>{{ durationText }}</td>
            </tr>
            <tr v-if="!notice.scope.length">
              <td colspan="5" class="empty-state">还没有落影响小区，请编辑草稿逐个添加</td>
            </tr>
          </tbody>
        </table>
        <p v-if="notice.scope.length" class="card-foot-text">
          共 {{ notice.scope.length }} 个小区，合计影响 {{ affectedHouseholds(notice) }} 户。
        </p>
      </section>

      <section class="detail-card">
        <h3>补充说明（只许追加）</h3>
        <ul v-if="notice.addenda.length" class="addendum-list">
          <li v-for="item in notice.addenda" :key="item.id">
            <p>{{ item.content }}</p>
            <span class="cell-sub">{{ item.createdAt }}</span>
          </li>
        </ul>
        <p v-else class="muted-text">暂无补充说明。</p>
        <form v-if="notice.status !== '草稿'" class="addendum-form" @submit.prevent="submitAddendum">
          <textarea v-model.trim="addendumText" rows="2" placeholder="发布后只能在末尾追加说明，如复水时间变化、临时取水点等" />
          <div class="addendum-actions">
            <span v-if="addendumError" class="error-text">{{ addendumError }}</span>
            <button class="btn primary" type="submit" :disabled="!addendumText">追加说明</button>
          </div>
        </form>
        <p v-else class="muted-text">草稿阶段请直接编辑通知正文，发布后在此追加说明。</p>
      </section>

      <section class="detail-card">
        <h3>本通知关联的客服诉求</h3>
        <table class="data-table">
          <thead>
            <tr><th>受理编号</th><th>所属小区</th><th>诉求类型</th><th>诉求内容</th><th>受理时间</th><th>状态</th></tr>
          </thead>
          <tbody>
            <tr v-for="ticket in linkedTickets" :key="ticket.id">
              <td>{{ ticket.serial }}</td>
              <td>{{ ticket.community }}</td>
              <td>{{ ticket.kind }}</td>
              <td>{{ ticket.summary }}</td>
              <td>{{ ticket.receivedAt }}</td>
              <td>{{ ticket.status }}</td>
            </tr>
            <tr v-if="!linkedTickets.length">
              <td colspan="6" class="empty-state">暂无关联诉求；发布后受影响小区的来电会自动归并到这里</td>
            </tr>
          </tbody>
        </table>
      </section>

      <NoticeEditor v-if="editing" :notice-id="notice.id" @cancel="editing = false" @saved="onSaved" />
      <PublishDialog
        v-if="publishing"
        :notice="notice"
        :mode="notice.publishState === 'failed' ? 'retry' : 'publish'"
        @cancel="publishing = false"
        @published="onPublished"
      />
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

import {
  addAddendum,
  affectedHouseholds,
  currentWindow,
  endNotice,
  formatDuration,
  getNotice,
  listTickets,
  windowRange,
} from '@/api/outage-service'
import { NOTICE_STATUSES } from '@/data/outage-types'
import NoticeEditor from './NoticeEditor.vue'
import PublishDialog from './PublishDialog.vue'

const route = useRoute()

const notice = ref(getNotice(Number(route.params.id)))
const tickets = ref(listTickets())

const editing = ref(false)
const publishing = ref(false)
const actionMessage = ref('')
const actionOk = ref(true)
const addendumText = ref('')
const addendumError = ref('')

const win = computed(() => (notice.value ? currentWindow(notice.value) : null))
const durationText = computed(() =>
  win.value ? formatDuration(win.value.startAt, win.value.endAt) : '—',
)

const currentStep = computed(() => (notice.value ? NOTICE_STATUSES.indexOf(notice.value.status) : -1))

const statusSteps = computed(() => {
  if (!notice.value) {
    return []
  }
  return [
    { status: '草稿' as const, time: `建稿 ${notice.value.createdAt}` },
    { status: '已发布' as const, time: notice.value.publishedAt ?? '待发布' },
    { status: '已结束' as const, time: notice.value.endedAt ?? '待结束' },
  ]
})

const linkedTickets = computed(() =>
  tickets.value.filter((ticket) => ticket.linkedNoticeId === notice.value?.id),
)

function refresh(id: number) {
  notice.value = getNotice(id)
  tickets.value = listTickets()
}

function flash(ok: boolean, message: string) {
  actionOk.value = ok
  actionMessage.value = message
}

function startPublish() {
  publishing.value = true
}

function startRetry() {
  publishing.value = true
}

function onPublished() {
  if (!notice.value) {
    return
  }
  const id = notice.value.id
  publishing.value = false
  refresh(id)
  flash(true, '发布成功，客服诉求清单已按影响范围重排')
}

function onSaved() {
  if (!notice.value) {
    return
  }
  const id = notice.value.id
  editing.value = false
  refresh(id)
  flash(true, '草稿已更新')
}

function finish() {
  if (!notice.value) {
    return
  }
  const result = endNotice(notice.value.id)
  refresh(notice.value.id)
  flash(result.ok, result.message)
}

function submitAddendum() {
  if (!notice.value) {
    return
  }
  addendumError.value = ''
  const result = addAddendum(notice.value.id, addendumText.value)
  if (!result.ok) {
    addendumError.value = result.message
    return
  }
  addendumText.value = ''
  refresh(notice.value.id)
  flash(true, '补充说明已追加，既有内容未改动')
}
</script>
