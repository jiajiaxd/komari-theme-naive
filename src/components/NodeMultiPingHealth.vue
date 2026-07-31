<script setup lang="ts">
import { NText, NTooltip } from 'naive-ui'
import { computed, ref } from 'vue'
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

const safeMax = computed(() => {
  let max = 1
  for (const line of lines.value) {
    if (line.item.max > max)
      max = line.item.max
  }
  return max
})

const barHeight = computed(() => (props.compact ? 6 : 8))

type BucketKind = 'latency' | 'loss'

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

const hoveredLineIndex = ref<number | null>(null)
const hoveredMetric = ref<BucketKind | null>(null)
const hoveredBucketIndex = ref<number | null>(null)

function barStyle(line: typeof lines.value[number], bucketIndex: number, kind: BucketKind): Record<string, string> {
  const buckets = pingStore.getLineBuckets(line)
  const bucket = buckets[bucketIndex]
  const height = barHeight.value
  const barCount = buckets.length || 1
  if (!bucket)
    return { height: `${height}px`, width: `${Math.max(1, 100 / barCount - 1)}%`, opacity: '0' }
  if (kind === 'latency') {
    const value = bucket.value
    const active = value != null && Number.isFinite(value) && value >= 0
    const pct = active ? Math.max(20, Math.min(100, (value! / safeMax.value) * 100)) : 24
    return {
      height: `${height}px`,
      width: `${Math.max(1, 100 / barCount - 1)}%`,
      transform: `scaleY(${active ? pct / 100 : 0.25})`,
      backgroundColor: active ? latencyHeatColor(value) : 'var(--n-border-color)',
      opacity: active ? '0.92' : '0.42',
    }
  }
  else {
    const loss = bucket.loss
    const active = loss != null && Number.isFinite(loss) && bucket.total > 0
    return {
      height: `${height}px`,
      width: `${Math.max(1, 100 / barCount - 1)}%`,
      opacity: active ? '0.94' : '0.42',
      backgroundColor: active ? lossHeatColor(loss) : 'var(--n-border-color)',
    }
  }
}

function formatBucketTooltip(line: typeof lines.value[number], bucketIndex: number, kind: BucketKind): string {
  const buckets = pingStore.getLineBuckets(line)
  const bucket = buckets[bucketIndex]
  if (!bucket)
    return ''
  const start = new Date(bucket.startAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  const taskName = line.taskName
  if (kind === 'latency') {
    if (bucket.value == null)
      return `${taskName} · ${start} 无样本`
    return `${taskName} · ${start} 延迟 ${Math.round(bucket.value)}ms`
  }
  if (bucket.loss == null || bucket.total === 0)
    return `${taskName} · ${start} 无样本`
  return `${taskName} · ${start} 丢包 ${bucket.loss.toFixed(1)}% (${bucket.total}发)`
}
</script>

<template>
  <div class="multi-ping-health" :class="{ 'multi-ping-health--compact': compact }">
    <div v-for="(line, lineIdx) in lines" :key="line.taskId" class="multi-ping-row">
      <div class="multi-ping-row-head">
        <span class="multi-ping-row-name" :title="line.taskName">{{ line.taskName }}</span>
        <div class="multi-ping-row-values">
          <NText
            class="multi-ping-row-value"
            :style="{ color: latencyHeatColor(line.item.lastValue), fontFamily: appStore.numberFontFamily }"
            :depth="3"
          >
            {{ latencyLabel(line.item.lastValue) }}
          </NText>
          <NText
            class="multi-ping-row-value"
            :style="{ color: lossHeatColor(line.item.loss), fontFamily: appStore.numberFontFamily }"
            :depth="3"
          >
            {{ lossLabel(line.item.loss) }}
          </NText>
        </div>
      </div>
      <div class="multi-ping-row-bars">
        <NTooltip
          v-for="(_bucket, bucketIdx) in pingStore.getLineBuckets(line)"
          :key="bucketIdx"
          placement="top"
          :disabled="hoveredLineIndex !== lineIdx || hoveredBucketIndex !== bucketIdx"
        >
          <template #trigger>
            <div class="multi-ping-bars-stack">
              <div
                :style="{
                  ...barStyle(line, bucketIdx, 'latency'),
                  borderBottomLeftRadius: bucketIdx === 0 ? '2px' : '0',
                  borderBottomRightRadius: bucketIdx === pingStore.getLineBuckets(line).length - 1 ? '2px' : '0',
                }"
                @mouseenter="hoveredLineIndex = lineIdx; hoveredBucketIndex = bucketIdx; hoveredMetric = 'latency'"
                @mouseleave="hoveredLineIndex = null; hoveredBucketIndex = null; hoveredMetric = null"
              />
              <div
                :style="{
                  ...barStyle(line, bucketIdx, 'loss'),
                  borderBottomLeftRadius: bucketIdx === 0 ? '2px' : '0',
                  borderBottomRightRadius: bucketIdx === pingStore.getLineBuckets(line).length - 1 ? '2px' : '0',
                }"
                @mouseenter="hoveredLineIndex = lineIdx; hoveredBucketIndex = bucketIdx; hoveredMetric = 'loss'"
                @mouseleave="hoveredLineIndex = null; hoveredBucketIndex = null; hoveredMetric = null"
              />
            </div>
          </template>
          {{ hoveredMetric && formatBucketTooltip(line, bucketIdx, hoveredMetric) }}
        </NTooltip>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.multi-ping-health {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0;
}

.multi-ping-health--compact {
  gap: 2px;
}

.multi-ping-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.multi-ping-row-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.multi-ping-row-name {
  font-size: 11px;
  color: var(--n-text-color-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 55%;
}

.multi-ping-row-values {
  display: flex;
  gap: 8px;
}

.multi-ping-row-value {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
}

.multi-ping-row-bars {
  display: flex;
  align-items: flex-end;
  gap: 1px;
  height: 12px;
}

.multi-ping-bars-stack {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 2px;
}
</style>
