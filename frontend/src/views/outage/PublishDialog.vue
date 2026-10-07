<template>
  <div class="modal-mask" @click.self="$emit('cancel')">
    <section class="modal" role="dialog" aria-modal="true">
      <header class="modal-head">
        <h3>{{ mode === 'retry' ? '重试发布' : '发布停水通知' }}</h3>
        <button class="link" type="button" @click="$emit('cancel')">关闭</button>
      </header>

      <div class="modal-body">
        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
        <div v-if="notice" class="publish-summary">
          <p><strong>{{ notice.outageCode }} · {{ notice.title }}</strong></p>
          <p class="muted-text">{{ windowRange(notice) }}（{{ duration }}，时段取最后一版 v{{ currentWindow(notice).version }}）</p>
          <table class="data-table scope-table">
            <thead>
              <tr><th>影响小区</th><th>通知渠道</th><th>影响户数</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in notice.scope" :key="row.id">
                <td>{{ row.community }}</td>
                <td>{{ row.channels.join('、') }}</td>
                <td>{{ row.households }} 户</td>
              </tr>
            </tbody>
          </table>
          <p class="muted-text">
            共 {{ notice.scope.length }} 个小区、{{ households }} 户。发布后客服诉求清单会按这份影响范围立即重排，
            已发布通知的影响范围将锁定，只能追加补充说明。
          </p>
          <label class="simulate-line">
            <input v-model="simulateFailure" type="checkbox" />
            模拟通知渠道下发失败（演示失败留痕与原样重试）
          </label>
        </div>
      </div>

      <footer class="modal-foot">
        <span class="foot-actions">
          <button class="btn ghost" type="button" @click="$emit('cancel')">取消</button>
          <button class="btn primary" type="button" :disabled="publishing" @click="confirm">
            {{ publishing ? '发布中…' : mode === 'retry' ? '重试发布' : '确认发布' }}
          </button>
        </span>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
// computed 用于发布摘要中的户数/时长派生

import {
  affectedHouseholds,
  currentWindow,
  formatDuration,
  publishNotice,
  retryPublish,
  windowRange,
} from '@/api/outage-service'
import type { OutageNotice } from '@/data/outage-types'

const props = defineProps<{ notice: OutageNotice; mode: 'publish' | 'retry' }>()
const emit = defineEmits<{
  cancel: []
  published: []
}>()

const errorMessage = ref('')
const publishing = ref(false)
const simulateFailure = ref(false)
// 重试入口默认不勾失败：正常情况一点就成功；想再演示一次失败可以手动勾上。

const households = computed(() => affectedHouseholds(props.notice))
const duration = computed(() => {
  const win = currentWindow(props.notice)
  return formatDuration(win.startAt, win.endAt)
})

function confirm() {
  errorMessage.value = ''
  publishing.value = true
  const result =
    props.mode === 'retry'
      ? retryPublish(props.notice.id, simulateFailure.value)
      : publishNotice(props.notice.id, simulateFailure.value)
  publishing.value = false
  if (!result.ok) {
    errorMessage.value = result.retryable
      ? `${result.message}（状态保持草稿，可直接重试）`
      : result.message
    return
  }
  emit('published')
}
</script>
