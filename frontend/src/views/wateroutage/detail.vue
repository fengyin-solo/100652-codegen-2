<template>
  <section v-if="notice" class="page detail-page">
    <header class="page-head">
      <div>
        <h2>
          停水通知 {{ notice.outageNo }}
          <span class="status-badge" :class="`st-${notice.status}`">{{ notice.status }}</span>
          <span v-if="notice.windowVersion > 1" class="version-tag">停水时段第 {{ notice.windowVersion }} 版（最后一版）</span>
        </h2>
        <p class="page-desc">{{ notice.area }} · {{ notice.reason || '停水原因待补充' }}</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/wateroutage">返回列表</RouterLink>
      </div>
    </header>

    <div v-if="notice.publishError" class="alert error">
      <strong>发布失败：</strong>{{ notice.publishError }}
      <button class="btn primary btn-sm" type="button" @click="retryPublish">重试发布</button>
    </div>
    <div v-else-if="notice.status === '草稿' && notice.scopePersisted" class="alert warn">
      影响范围已落库，但通知渠道还未下发成功，重试发布即可继续。
      <button class="btn primary btn-sm" type="button" @click="retryPublish">重试发布</button>
    </div>

    <article class="detail-card">
      <h3>停水时段（权威口径：列表页与详情页一致）</h3>
      <div class="kv-grid">
        <div><span>停水开始</span><strong>{{ formatDateTime(notice.startTime) }}</strong></div>
        <div><span>停水结束</span><strong>{{ formatDateTime(notice.endTime) }}</strong></div>
        <div><span>通知级时长</span><strong>{{ formatDuration(notice.startTime, notice.endTime) }}</strong></div>
        <div><span>创建时间</span><strong>{{ notice.createdAt }}</strong></div>
        <div><span>发布时间</span><strong>{{ notice.publishedAt || '—' }}</strong></div>
        <div><span>结束时间</span><strong>{{ notice.endedAt || '—' }}</strong></div>
      </div>
    </article>

    <article class="detail-card">
      <h3>
        影响小区逐个排列（{{ communities.length }} 个）
        <span class="sub-note">已发布后冻结，不许改小，只能追加补充说明</span>
      </h3>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 48px">序</th>
            <th>影响小区</th>
            <th>小区停水开始</th>
            <th>小区停水结束</th>
            <th>停多久</th>
            <th>通知渠道</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(c, i) in communities" :key="c.community">
            <td>{{ i + 1 }}</td>
            <td><strong>{{ c.community }}</strong></td>
            <td>{{ formatDateTime(c.startTime) }}</td>
            <td>{{ formatDateTime(c.endTime) }}</td>
            <td>{{ formatDuration(c.startTime, c.endTime) }}</td>
            <td>{{ channelLabel(c.channels) }}</td>
          </tr>
          <tr v-if="!communities.length">
            <td colspan="6" class="empty-state">影响小区为空——这种通知不许发布</td>
          </tr>
        </tbody>
      </table>
    </article>

    <article class="detail-card">
      <h3>影响范围落库</h3>
      <div v-if="scope" class="scope-box">
        <p class="ok-text">
          已落库（{{ scope.persistedAt }}）· 快照对应时段第 {{ scope.windowVersion }} 版 ·
          发布尝试 {{ scope.publishAttempts }} 次 · {{ scope.published ? '已随发布生效' : '尚未发布生效' }}
        </p>
        <details>
          <summary>查看落库快照中的小区（{{ scope.communities.length }} 个）</summary>
          <ul class="scope-list">
            <li v-for="c in scope.communities" :key="c.community">
              {{ c.community }} — {{ formatWindow(c.startTime, c.endTime) }}（{{ channelLabel(c.channels) }}）
            </li>
          </ul>
        </details>
      </div>
      <p v-else class="muted-text">尚未落库：发布动作会先把当前影响范围写入落库记录，再走通知渠道。</p>
    </article>

    <article class="detail-card">
      <h3>补充说明（只许追加，历史不可改）</h3>
      <ul v-if="notice.supplements.length" class="supplement-list">
        <li v-for="(s, i) in notice.supplements" :key="i">
          <span class="supplement-at">{{ s.at }} · {{ s.operator }}</span>
          <p>{{ s.text }}</p>
        </li>
      </ul>
      <p v-else class="muted-text">暂无补充说明。</p>
      <form v-if="notice.status !== '草稿'" class="supplement-form" @submit.prevent="submitSupplement">
        <textarea v-model="supplementText" rows="2" placeholder="已发布/已结束通知只能在此追加补充说明，例如复水时间提前、个别小区延长等"></textarea>
        <div class="form-foot-row">
          <button class="btn primary" type="submit">追加补充说明</button>
        </div>
      </form>
      <p v-else class="muted-text">草稿阶段请点「编辑草稿」直接修改正文与影响小区。</p>
    </article>

    <div class="detail-actions">
      <RouterLink class="btn" to="/wateroutage">返回列表</RouterLink>
      <button v-if="notice.status === '草稿'" class="btn" type="button" @click="goEdit">编辑草稿</button>
      <button v-if="notice.status === '草稿'" class="btn primary" type="button" @click="retryPublish">
        {{ notice.publishError ? '重试发布' : '发布' }}
      </button>
      <button v-if="notice.status === '已发布'" class="btn primary" type="button" @click="finish">结束通知</button>
    </div>

    <footer class="page-foot">
      <span v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</span>
    </footer>

    <NoticeForm :open="formOpen" :notice="notice" @close="formOpen = false" @submit="saveDraft" />
  </section>

  <section v-else class="page">
    <p class="error-text">没有找到这张停水通知，可能已被重置。</p>
    <RouterLink class="btn" to="/wateroutage">返回列表</RouterLink>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import {
  addSupplement,
  channelLabel,
  closeNotice,
  formatDateTime,
  formatDuration,
  formatWindow,
  getNotice,
  getScope,
  listCommunities,
  publishNotice,
  updateDraft,
} from '@/api/water-outage-service'
import NoticeForm from './NoticeForm.vue'

const route = useRoute()

const notice = ref(getNotice(Number(route.params.id)))
const scope = ref(getScope(Number(route.params.id)))
const communities = computed(() => (notice.value ? listCommunities(notice.value) : []))
const supplementText = ref('')
const message = ref('')
const messageOk = ref(false)
const formOpen = ref(false)

function refresh() {
  notice.value = getNotice(Number(route.params.id))
  scope.value = getScope(Number(route.params.id))
}

function flash(ok: boolean, text: string) {
  messageOk.value = ok
  message.value = text
}

function retryPublish() {
  if (!notice.value) return
  const result = publishNotice(notice.value.id)
  refresh()
  flash(result.ok, result.message)
}

function finish() {
  if (!notice.value) return
  const result = closeNotice(notice.value.id)
  refresh()
  flash(result.ok, result.message)
}

function submitSupplement() {
  if (!notice.value) return
  const result = addSupplement(notice.value.id, supplementText.value)
  if (!result.ok) {
    flash(false, result.message)
    return
  }
  supplementText.value = ''
  refresh()
  flash(true, result.message)
}

function goEdit() {
  formOpen.value = true
}

function saveDraft(payload: { id?: number; input: Parameters<typeof updateDraft>[1] }) {
  if (!payload.id) return
  const result = updateDraft(payload.id, payload.input)
  if (!result.ok) {
    flash(false, result.message)
    return
  }
  formOpen.value = false
  refresh()
  flash(true, result.message)
}

onMounted(refresh)
</script>

<style scoped>
.detail-card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
}
.detail-card h3 { margin: 0 0 10px; font-size: 15px; }
.sub-note { font-size: 12px; color: var(--muted); font-weight: 400; margin-left: 8px; }
.kv-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.kv-grid span { display: block; font-size: 12px; color: var(--muted); }
.kv-grid strong { font-size: 14px; }
.status-badge { border-radius: 999px; padding: 2px 10px; font-size: 12px; vertical-align: middle; }
.st-草稿 { background: #f2f4f7; color: #475467; }
.st-已发布 { background: #dcfae6; color: #027a48; }
.st-已结束 { background: #e9e7f5; color: #5925dc; }
.version-tag { font-size: 12px; color: #b54708; background: #fffaeb; border-radius: 999px; padding: 2px 10px; margin-left: 8px; }
.alert { border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-size: 13px; display: flex; align-items: center; gap: 12px; }
.alert.error { background: #fef3f2; border: 1px solid #fecdca; color: #b42318; }
.alert.warn { background: #fffaeb; border: 1px solid #fedf89; color: #b54708; }
.btn-sm { padding: 3px 10px; font-size: 12px; }
.ok-text { color: #0f766e; }
.muted-text { color: var(--muted); }
.scope-box { font-size: 13px; }
.scope-list { margin: 6px 0 0; padding-left: 20px; font-size: 13px; line-height: 1.9; }
.supplement-list { list-style: none; margin: 0 0 10px; padding: 0; }
.supplement-list li { border-left: 3px solid var(--brand); padding: 4px 0 4px 10px; margin-bottom: 8px; }
.supplement-at { font-size: 12px; color: var(--muted); }
.supplement-list p { margin: 2px 0 0; }
.supplement-form textarea { width: 100%; border: 1px solid var(--border); border-radius: 6px; padding: 8px; font-family: inherit; resize: vertical; }
.form-foot-row { display: flex; justify-content: flex-end; margin-top: 8px; }
.detail-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
