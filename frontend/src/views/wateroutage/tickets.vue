<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>客服受理诉求清单（城东片区来电）</h2>
        <p class="page-desc">停水通知一旦发布，命中其影响小区的未办结诉求会自动顶到最前，客服优先受理；已办结诉求沉底。置顶序号由发布动作按序产生。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/wateroutage">返回停水通知</RouterLink>
      </div>
    </header>

    <p class="status-legend">
      <span class="legend-item">当前置顶序号水位：{{ seq }}</span>
      <span class="legend-item">置顶未办结：{{ boostedCount }} 条</span>
      <span class="legend-item">待受理：{{ pendingCount }} 条</span>
    </p>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 40px">序</th>
          <th>诉求编号</th>
          <th>来电小区</th>
          <th>来电人</th>
          <th>诉求内容</th>
          <th>来电时间</th>
          <th>关联停水</th>
          <th>重排说明</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in tickets" :key="row.id" :class="{ boosted: row.boostSeq > 0 && row.status !== '已办结' }">
          <td>{{ i + 1 }}</td>
          <td>{{ row.ticketNo }}</td>
          <td>{{ row.community }}</td>
          <td>{{ row.caller }}</td>
          <td>{{ row.summary }}</td>
          <td>{{ row.receivedAt }}</td>
          <td>
            <RouterLink v-if="row.linkedOutageNo" class="link" :to="linkedPath(row.linkedOutageNo)">
              {{ row.linkedOutageNo }}
            </RouterLink>
            <span v-else>—</span>
          </td>
          <td class="reorder-cell">
            <span v-if="row.boostSeq > 0" class="boost-tag">置顶 #{{ row.boostSeq }}</span>
            <span class="sub">{{ row.reorderReason || '常规来电，按来电时间排队' }}</span>
          </td>
          <td><span class="status-badge" :class="`tk-${row.status}`">{{ row.status }}</span></td>
          <td class="row-actions">
            <button v-if="row.status !== '已办结'" class="link" type="button" @click="advance(row.id)">
              {{ row.status === '待受理' ? '受理' : '办结' }}
            </button>
            <span v-else class="muted-text">已沉底</span>
          </td>
        </tr>
        <tr v-if="!tickets.length">
          <td colspan="10" class="empty-state">暂无诉求</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ tickets.length }} 条诉求；发布停水通知后此清单会再次重排</span>
      <span v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { advanceTicket, listTickets } from '@/api/water-outage-service'
import type { ServiceTicket } from '@/data/water-outage'
import { waterState } from '@/data/water-store'

const tickets = ref<ServiceTicket[]>([])
const message = ref('')
const messageOk = ref(false)
const seq = ref(0)

const boostedCount = computed(
  () => tickets.value.filter((t) => t.boostSeq > 0 && t.status !== '已办结').length,
)
const pendingCount = computed(() => tickets.value.filter((t) => t.status === '待受理').length)

function reload() {
  tickets.value = listTickets()
  seq.value = waterState().meta.reorderSeq
}

function advance(id: number) {
  const result = advanceTicket(id)
  messageOk.value = result.ok
  message.value = result.message
  reload()
}

function linkedPath(outageNo: string): string {
  const found = waterState().notices.find((n) => n.outageNo === outageNo)
  return found ? `/wateroutage/${found.id}` : '/wateroutage'
}

onMounted(reload)
</script>

<style scoped>
.boosted { background: #f0fdf4; }
.boost-tag { display: inline-block; background: #dcfae6; color: #027a48; border-radius: 4px; padding: 0 8px; font-size: 12px; margin-right: 6px; }
.sub { font-size: 12px; color: var(--muted); }
.reorder-cell { max-width: 240px; }
.status-badge { border-radius: 999px; padding: 2px 10px; font-size: 12px; }
.tk-待受理 { background: #fef0c7; color: #b54708; }
.tk-处理中 { background: #d1e9ff; color: #175cd3; }
.tk-已办结 { background: #f2f4f7; color: #667085; }
.ok-text { color: #0f766e; }
.muted-text { color: var(--muted); }
</style>
