<script setup lang="ts">
import type { PingOverviewLine } from '@/types/komari'
import { NText } from 'naive-ui'
import { computed } from 'vue'
import PingHistoryStrip from '@/components/PingHistoryStrip.vue'
import { useAppStore } from '@/stores/app'
import { usePingOverviewStore } from '@/stores/pingOverview'
import { latencyHeatColor, lossHeatColor } from '@/utils/pingOverview'

const props = defineProps<{
  uuid: string
  compact?: boolean
}>()

const appStore = useAppStore()
const pingStore = usePingOverviewStore()

const lines = computed(() => pingStore.getLines(props.uuid))
const lineViews = computed(() => lines.value.map(line => ({
  line,
  buckets: pingStore.getLineBuckets(line),
})))

function latencyLabel(value: number | null): string {
  if (value == null)
    return '—'
  return `${Math.round(value)}ms`
}

function lossLabel(value: number | null): string {
  if (value == null)
    return '—'
  return `${value.toFixed(1)}%`
}

function getLineName(line: PingOverviewLine): string {
  return line.taskName || `任务 #${line.taskId}`
}
</script>

<template>
  <div class="multi-ping-health" :class="{ 'multi-ping-health--compact': compact }">
    <div class="multi-ping-heading">
      <span class="multi-ping-title">网络质量</span>
      <span class="multi-ping-window">最近 1 小时</span>
    </div>
    <div v-if="lineViews.length > 0" class="multi-ping-rows">
      <div v-for="lineView in lineViews" :key="lineView.line.taskId" class="multi-ping-row">
        <span class="multi-ping-row-name" :title="getLineName(lineView.line)">
          {{ getLineName(lineView.line) }}
        </span>
        <PingHistoryStrip
          label="延迟"
          :value="latencyLabel(lineView.line.item.lastValue)"
          :value-color="latencyHeatColor(lineView.line.item.lastValue)"
          :font-family="appStore.numberFontFamily"
          :buckets="lineView.buckets"
          metric="latency"
          :tooltip-prefix="getLineName(lineView.line)"
          :compact="compact"
        />
        <PingHistoryStrip
          label="丢包"
          :value="lossLabel(lineView.line.item.loss)"
          :value-color="lossHeatColor(lineView.line.item.loss)"
          :font-family="appStore.numberFontFamily"
          :buckets="lineView.buckets"
          metric="loss"
          :tooltip-prefix="getLineName(lineView.line)"
          :compact="compact"
        />
      </div>
    </div>
    <div v-else class="multi-ping-placeholder">
      <NText :depth="3" class="text-xs">
        未配置首页 Ping
      </NText>
    </div>
  </div>
</template>

<style scoped lang="scss">
.multi-ping-health {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
}

.multi-ping-health--compact {
  gap: 6px;
}

.multi-ping-heading {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.multi-ping-title {
  color: var(--n-text-color-2);
  font-size: 12px;
  font-weight: 600;
}

.multi-ping-window {
  color: var(--n-text-color-3);
  font-size: 10px;
}

.multi-ping-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.multi-ping-health--compact .multi-ping-rows {
  gap: 6px;
}

.multi-ping-row {
  display: grid;
  grid-template-columns: minmax(84px, 0.45fr) repeat(2, minmax(0, 1fr));
  gap: 8px;
  align-items: stretch;
}

.multi-ping-row-name {
  display: flex;
  min-width: 0;
  align-items: center;
  color: var(--n-text-color-2);
  font-size: 11px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.multi-ping-placeholder {
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--n-border-color) 45%, transparent);
  border-radius: 6px;
  background-color: color-mix(in srgb, var(--n-color) 30%, transparent);
}

@media (max-width: 640px) {
  .multi-ping-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .multi-ping-row-name {
    grid-column: 1 / -1;
  }
}
</style>
