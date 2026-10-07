<template>
  <div v-if="open" class="modal-mask" @click.self="close">
    <div class="modal wide">
      <header class="modal-head">
        <h3>{{ isEdit ? '编辑停水通知草稿' : '开具停水通知' }}</h3>
        <button class="btn ghost" type="button" @click="close">关闭</button>
      </header>

      <div class="form-grid">
        <label class="form-item">
          <span>停水编号 <i>*</i></span>
          <input v-model="form.outageNo" placeholder="如 TS-20261009-01" />
        </label>
        <label class="form-item">
          <span>所属片区 <i>*</i></span>
          <input v-model="form.area" placeholder="如 城东片区" />
        </label>
        <label class="form-item span-2">
          <span>停水原因</span>
          <input v-model="form.reason" placeholder="如 主干管迁改接拢" />
        </label>
        <label class="form-item">
          <span>停水开始 <i>*</i></span>
          <input v-model="form.startTime" type="datetime-local" />
        </label>
        <label class="form-item">
          <span>停水结束 <i>*</i></span>
          <input v-model="form.endTime" type="datetime-local" />
        </label>
      </div>

      <div class="community-head">
        <strong>影响小区（逐个排列，空列表不许发布）</strong>
        <label class="sync-toggle">
          <input type="checkbox" v-model="syncWindow" />
          改通知级停水时段时同步到各小区
        </label>
      </div>

      <table class="data-table community-table">
        <thead>
          <tr>
            <th style="width: 160px">影响小区 <i>*</i></th>
            <th style="width: 190px">小区停水开始 <i>*</i></th>
            <th style="width: 190px">小区停水结束 <i>*</i></th>
            <th>通知渠道 <i>*</i></th>
            <th style="width: 56px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in form.communities" :key="index">
            <td><input v-model="row.community" placeholder="小区名称" /></td>
            <td><input v-model="row.startTime" type="datetime-local" /></td>
            <td><input v-model="row.endTime" type="datetime-local" /></td>
            <td>
              <div class="channel-picker">
                <label v-for="ch in channelOptions" :key="ch" class="channel-chip">
                  <input type="checkbox" :checked="row.channels.includes(ch)" @change="toggleChannel(row, ch)" />
                  {{ ch }}
                </label>
              </div>
            </td>
            <td>
              <button class="link danger" type="button" @click="removeCommunity(index)">删除</button>
            </td>
          </tr>
          <tr v-if="!form.communities.length">
            <td colspan="5" class="empty-state">还没有影响小区——这种状态不能发布，请先添加</td>
          </tr>
        </tbody>
      </table>
      <div class="form-foot-row">
        <button class="btn" type="button" @click="addCommunity">＋ 添加影响小区</button>
        <span class="hint">停水时段改动后按最后一版为准；逐小区时段可单独调整。</span>
      </div>

      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

      <footer class="modal-foot">
        <button class="btn" type="button" @click="close">取消</button>
        <button class="btn primary" type="button" @click="submit">保存草稿</button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'

import { NOTICE_CHANNELS, type AffectedCommunity, type OutageNotice } from '@/data/water-outage'

const props = defineProps<{ open: boolean; notice?: OutageNotice | null }>()
const emit = defineEmits<{
  close: []
  submit: [payload: { id?: number; input: FormState }]
}>()

type FormState = {
  outageNo: string
  area: string
  reason: string
  startTime: string
  endTime: string
  communities: AffectedCommunity[]
}

const channelOptions = [...NOTICE_CHANNELS]
const errorMessage = ref('')
const syncWindow = ref(true)

function emptyCommunity(start = '', end = ''): AffectedCommunity {
  return { community: '', startTime: start, endTime: end, channels: ['短信通知'] }
}

const form = reactive<FormState>({
  outageNo: '',
  area: '',
  reason: '',
  startTime: '',
  endTime: '',
  communities: [],
})

const isEdit = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    errorMessage.value = ''
    if (props.notice) {
      isEdit.value = true
      const communitiesCopy = JSON.parse(JSON.stringify(props.notice.communities)) as AffectedCommunity[]
      // 已经存在逐小区差异时段时，默认不联动，避免一打开就把差异覆盖掉。
      syncWindow.value = communitiesCopy.every(
        (row) => row.startTime === props.notice!.startTime && row.endTime === props.notice!.endTime,
      )
      Object.assign(form, {
        outageNo: props.notice.outageNo,
        area: props.notice.area,
        reason: props.notice.reason,
        startTime: props.notice.startTime,
        endTime: props.notice.endTime,
        communities: communitiesCopy,
      })
    } else {
      isEdit.value = false
      Object.assign(form, {
        outageNo: '',
        area: '城东片区',
        reason: '',
        startTime: '',
        endTime: '',
        communities: [emptyCommunity()],
      })
    }
  },
)

// 勾选同步时，通知级时段变化联动覆盖各小区；去掉勾选后各小区独立。
watch(
  () => [form.startTime, form.endTime] as const,
  ([start, end]) => {
    if (!syncWindow.value || !props.open) return
    for (const row of form.communities) {
      row.startTime = start
      row.endTime = end
    }
  },
)

function addCommunity() {
  form.communities.push(emptyCommunity(form.startTime, form.endTime))
}

function removeCommunity(index: number) {
  form.communities.splice(index, 1)
}

function toggleChannel(row: AffectedCommunity, channel: string) {
  const index = row.channels.indexOf(channel)
  if (index >= 0) {
    row.channels.splice(index, 1)
  } else {
    row.channels.push(channel)
  }
}

function close() {
  emit('close')
}

function submit() {
  emit('submit', { id: props.notice?.id, input: { ...form, communities: JSON.parse(JSON.stringify(form.communities)) } })
}

defineExpose({ setError: (msg: string) => (errorMessage.value = msg) })
</script>
