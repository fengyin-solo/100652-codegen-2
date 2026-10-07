<template>
  <div class="modal-mask" @click.self="$emit('cancel')">
    <section class="modal modal-lg" role="dialog" aria-modal="true">
      <header class="modal-head">
        <h3>{{ noticeId ? '编辑停水通知草稿' : '新建停水通知' }}</h3>
        <button class="link" type="button" @click="$emit('cancel')">关闭</button>
      </header>

      <div class="modal-body">
        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

        <div class="form-grid">
          <label class="form-item">
            <span>停水编号 <b>*</b></span>
            <input v-model.trim="form.outageCode" placeholder="如 TS-20261007-01" />
          </label>
          <label class="form-item">
            <span>停水片区 <b>*</b></span>
            <input v-model.trim="form.area" placeholder="如 城东片区" />
          </label>
          <label class="form-item form-wide">
            <span>通知标题 <b>*</b></span>
            <input v-model.trim="form.title" placeholder="如 城东片区供水主干管割接停水通知" />
          </label>
          <label class="form-item form-wide">
            <span>停水事由</span>
            <textarea v-model.trim="form.reason" rows="2" placeholder="施工/检修原因、阀门动作等" />
          </label>

          <label class="form-item">
            <span>停水开始 <b>*</b></span>
            <input v-model="form.startAt" type="datetime-local" />
          </label>
          <label class="form-item">
            <span>预计复水 <b>*</b></span>
            <input v-model="form.endAt" type="datetime-local" />
          </label>
          <label class="form-item form-wide">
            <span>本版时段说明{{ durationHint }}</span>
            <input
              v-model.trim="form.windowReason"
              :placeholder="noticeId ? '改了时段请写明原因，保存后生成新版本，以最后一版为准' : '初版可不填'"
            />
          </label>
        </div>

        <div class="scope-head">
          <div>
            <strong>影响小区（按小区逐个落库）</strong>
            <span class="scope-tip">勾选通知渠道与影响户数后才计入发布范围</span>
          </div>
          <button class="btn" type="button" @click="addRow">添加小区</button>
        </div>

        <table class="data-table scope-table">
          <thead>
            <tr>
              <th style="width: 22%">小区名称</th>
              <th>通知渠道</th>
              <th style="width: 110px">影响户数</th>
              <th style="width: 60px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in form.scope" :key="row.rid">
              <td>
                <input v-model.trim="row.community" placeholder="小区全称" />
              </td>
              <td class="channel-cell">
                <label v-for="ch in channels" :key="ch" class="channel-chip">
                  <input v-model="row.channels" type="checkbox" :value="ch" />
                  {{ ch }}
                </label>
              </td>
              <td>
                <input v-model.number="row.households" type="number" min="1" step="1" placeholder="户" />
              </td>
              <td>
                <button class="link danger" type="button" @click="removeRow(index)">删除</button>
              </td>
            </tr>
            <tr v-if="!form.scope.length">
              <td colspan="4" class="empty-state">
                还没有影响小区——草稿可以先存，<b>但范围为空不许发布</b>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer class="modal-foot">
        <span class="scope-summary">
          已登记 {{ form.scope.length }} 个小区 · 合计 {{ householdsTotal }} 户
        </span>
        <span class="foot-actions">
          <button class="btn ghost" type="button" @click="$emit('cancel')">取消</button>
          <button class="btn primary" type="button" :disabled="saving" @click="submit">
            {{ saving ? '保存中…' : '保存草稿' }}
          </button>
        </span>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import { createNotice, formatDuration, getNotice, toInputValue, updateDraft } from '@/api/outage-service'
import { NOTIFY_CHANNELS } from '@/data/outage-types'
import type { NotifyChannel } from '@/data/outage-types'

const props = defineProps<{ noticeId: number | null }>()
const emit = defineEmits<{
  cancel: []
  saved: [id: number]
}>()

const channels = NOTIFY_CHANNELS

interface ScopeRow {
  rid: number
  community: string
  channels: NotifyChannel[]
  households: number | null
}

let ridSeq = 0
function makeRow(): ScopeRow {
  ridSeq += 1
  return { rid: ridSeq, community: '', channels: [], households: null }
}

function emptyForm() {
  return {
    outageCode: '',
    title: '',
    area: '',
    reason: '',
    startAt: '',
    endAt: '',
    windowReason: '',
    scope: [] as ScopeRow[],
  }
}

const form = reactive(emptyForm())
const errorMessage = ref('')
const saving = ref(false)

if (props.noticeId !== null) {
  const notice = getNotice(props.noticeId)
  if (notice && notice.status === '草稿') {
    const win = notice.windowRevisions[notice.windowRevisions.length - 1]
    form.outageCode = notice.outageCode
    form.title = notice.title
    form.area = notice.area
    form.reason = notice.reason
    form.startAt = toInputValue(win.startAt)
    form.endAt = toInputValue(win.endAt)
    form.windowReason = ''
    form.scope = notice.scope.map((item) => ({
      rid: (ridSeq += 1),
      community: item.community,
      channels: [...item.channels],
      households: item.households,
    }))
  }
}

const householdsTotal = computed(() =>
  form.scope.reduce((sum, item) => sum + (typeof item.households === 'number' && item.households > 0 ? item.households : 0), 0),
)

const durationHint = computed(() => {
  if (!form.startAt || !form.endAt) {
    return ''
  }
  const text = formatDuration(form.startAt.replace('T', ' '), form.endAt.replace('T', ' '))
  return text === '—' ? '' : `（当前时长 ${text}）`
})

function addRow() {
  form.scope.push(makeRow())
}

function removeRow(index: number) {
  form.scope.splice(index, 1)
}

function submit() {
  errorMessage.value = ''
  const payload = {
    outageCode: form.outageCode,
    title: form.title,
    area: form.area,
    reason: form.reason,
    startAt: form.startAt,
    endAt: form.endAt,
    windowReason: form.windowReason,
    scope: form.scope.map((row) => ({
      community: row.community,
      channels: row.channels,
      households: typeof row.households === 'number' ? row.households : 0,
    })),
  }
  saving.value = true
  const result =
    props.noticeId === null ? createNotice(payload) : updateDraft(props.noticeId, payload)
  saving.value = false
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  const id = result.data?.id ?? props.noticeId
  if (id === null) {
    errorMessage.value = '保存成功但没拿到通知编号，请刷新列表'
    return
  }
  emit('saved', id)
}
</script>
