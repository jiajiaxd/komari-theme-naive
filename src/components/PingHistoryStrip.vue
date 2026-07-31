<script setup lang="ts">
import type { PingOverviewBucket } from '@/types/komari'
import { NText, NTooltip } from 'naive-ui'
import { computed } from 'vue'
import { latencyHeatColor, lossHeatColor } from '@/utils/pingOverview'

type PingMetric = 'latency' | 'loss'

const props = defineProps<{
  label: string
  value: string
  valueColor: string
  fontFamily: string
  buckets: PingOverviewBucket[]
  metric: PingMetric
  tooltipPrefix?: string
  compact?: boolean
}>()

const barHeight = computed(() => (props.compact ? 14 : 18))

function hasValue(bucket: PingOverviewBucket): boolean {
  if (props.metric === 'latency') {
    return bucket.value != null && Number.isFinite(bucket.value) && bucket.value >= 0
  }
  return bucket.loss != null && Number.isFinite(bucket.loss) && bucket.total > 0
}

function barColor(bucket: PingOverviewBucket): string {
  if (!hasValue(bucket))
    return 'var(--n-border-color)'
  return props.metric === 'latency'
    ? latencyHeatColor(bucket.value)
    : lossHeatColor(bucket.loss)
}

function formatTooltip(bucket: PingOverviewBucket): string {
  const start = new Date(bucket.startAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const prefix = props.tooltipPrefix ? `${props.tooltipPrefix} · ` : ''

  if (props.metric === 'latency') {
    return bucket.value == null
      ? `${prefix}${start} 无样本`
      : `${prefix}${start} 延迟 ${Math.round(bucket.value)}ms`
  }

  return bucket.loss == null || bucket.total === 0
    ? `${prefix}${start} 无样本`
    : `${prefix}${start} 丢包 ${bucket.loss.toFixed(1)}% (${bucket.total}发)`
}
</script>

<template>
  <div class="ping-history-strip" :class="{ 'ping-history-strip--compact': compact }">
    <div class="ping-history-strip__head">
      <span class="ping-history-strip__label">{{ label }}</span>
      <NText
        class="ping-history-strip__value"
        :style="{ color: valueColor, fontFamily }"
      >
        {{ value }}
      </NText>
    </div>
    <div class="ping-history-strip__bars" :style="{ height: `${barHeight}px` }">
      <NTooltip
        v-for="bucket in buckets"
        :key="bucket.index"
        placement="top"
      >
        <template #trigger>
          <span
            class="ping-history-strip__bar"
            :style="{ backgroundColor: barColor(bucket), opacity: hasValue(bucket) ? '0.92' : '0.42' }"
          />
        </template>
        {{ formatTooltip(bucket) }}
      </NTooltip>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ping-history-strip {
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--n-border-color) 45%, transparent);
  border-radius: 6px;
  background-color: color-mix(in srgb, var(--n-color) 45%, transparent);
}

.ping-history-strip--compact {
  padding: 5px 6px;
}

.ping-history-strip__head {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 11px;
  line-height: 1;
}

.ping-history-strip__label {
  min-width: 0;
  overflow: hidden;
  color: var(--n-text-color-3);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ping-history-strip__value {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}

.ping-history-strip__bars {
  display: flex;
  gap: 2px;
  align-items: stretch;
  min-width: 0;
}

.ping-history-strip__bars :deep(.n-tooltip-trigger) {
  display: flex;
  flex: 1 1 0;
  min-width: 2px;
  height: 100%;
}

.ping-history-strip__bar {
  display: block;
  width: 100%;
  height: 100%;
  min-width: 2px;
  border-radius: 2px;
  transition:
    filter 180ms ease,
    opacity 180ms ease;
}

.ping-history-strip__bar:hover {
  filter: brightness(1.08);
  opacity: 1 !important;
}
</style>
