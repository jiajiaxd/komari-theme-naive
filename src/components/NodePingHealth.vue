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

const pingItem = computed(() => pingStore.getItem(props.uuid))
const pingBuckets = computed(() => pingStore.getBuckets(props.uuid))

const hasBinding = computed(() => pingItem.value.isAssigned)

const latencyValue = computed(() => pingItem.value.lastValue)
const lossValue = computed(() => pingItem.value.loss)
const pingMax = computed(() => pingItem.value.max)

const latencyColor = computed(() => latencyHeatColor(latencyValue.value))
const lossColor = computed(() => lossHeatColor(lossValue.value))

const latencyLabel = computed(() => {
  if (latencyValue.value == null)
    return '—'
  return `${Math.round(latencyValue.value)}ms`
})
const lossLabel = computed(() => {
  if (lossValue.value == null)
    return '—'
  return `${lossValue.value.toFixed(1)}%`
})

const hoveredLatencyIndex = ref<number | null>(null)
const hoveredLossIndex = ref<number | null>(null)

const barCount = computed(() => pingBuckets.value.length)
const safeMax = computed(() => (pingMax.value > 0 ? pingMax.value : 1))

const barHeight = computed(() => (props.compact ? 8 : 12))

type BucketKind = 'latency' | 'loss'

function barStyle(bucket: (typeof pingBuckets.value)[number], kind: BucketKind): Record<string, string> {
  const height = barHeight.value
  if (kind === 'latency') {
    const value = bucket.value
    const active = value != null && Number.isFinite(value) && value >= 0
    const pct = active ? Math.max(20, Math.min(100, (value! / safeMax.value) * 100)) : 24
    return {
      height: `${height}px`,
      width: `${Math.max(1, 100 / barCount.value - 1)}%`,
      transform: `scaleY(${active ? pct / 100 : 0.25})`,
      backgroundColor: active ? latencyHeatColor(value) : 'var(--n-border-color)',
      opacity: active ? '0.92' : '0.42',
    }
  }
  else {
    const loss = bucket.loss
    const active = loss != null && Number.isFinite(loss) && bucket.total > 0
    const barOpacity = active ? 0.94 : 0.42
    const barColor = active ? lossHeatColor(loss) : 'var(--n-border-color)'
    return {
      height: `${height}px`,
      width: `${Math.max(1, 100 / barCount.value - 1)}%`,
      opacity: String(barOpacity),
      backgroundColor: barColor,
    }
  }
}

function formatBucketTooltip(index: number, kind: BucketKind): string {
  const bucket = pingBuckets.value[index]
  if (!bucket)
    return ''
  const start = new Date(bucket.startAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (kind === 'latency') {
    if (bucket.value == null)
      return `${start} 无样本`
    return `${start} 延迟 ${Math.round(bucket.value)}ms`
  }
  if (bucket.loss == null || bucket.total === 0)
    return `${start} 无样本`
  return `${start} 丢包 ${bucket.loss.toFixed(1)}% (${bucket.total}发)`
}
</script>

<template>
  <div class="ping-health" :class="{ 'ping-health--compact': compact }">
    <template v-if="hasBinding">
      <div class="ping-health-block">
        <div class="ping-health-head">
          <span class="ping-health-label">延迟</span>
          <NText
            class="ping-health-value"
            :style="{ color: latencyColor, fontFamily: appStore.numberFontFamily }"
            :depth="3"
          >
            {{ latencyLabel }}
          </NText>
        </div>
        <div class="ping-health-bars">
          <NTooltip
            v-for="(bucket, idx) in pingBuckets"
            :key="idx"
            placement="top"
            :disabled="!bucket.value"
          >
            <template #trigger>
              <div
                class="ping-health-bar"
                :style="{
                  ...barStyle(bucket, 'latency'),
                  borderBottomLeftRadius: idx === 0 ? '2px' : '0',
                  borderBottomRightRadius: idx === barCount - 1 ? '2px' : '0',
                }"
                @mouseenter="hoveredLatencyIndex = idx"
                @mouseleave="hoveredLatencyIndex = null"
              />
            </template>
            {{ formatBucketTooltip(idx, 'latency') }}
          </NTooltip>
        </div>
      </div>
      <div class="ping-health-block">
        <div class="ping-health-head">
          <span class="ping-health-label">丢包</span>
          <NText
            class="ping-health-value"
            :style="{ color: lossColor, fontFamily: appStore.numberFontFamily }"
            :depth="3"
          >
            {{ lossLabel }}
          </NText>
        </div>
        <div class="ping-health-bars">
          <NTooltip
            v-for="(bucket, idx) in pingBuckets"
            :key="idx"
            placement="top"
            :disabled="bucket.loss == null"
          >
            <template #trigger>
              <div
                class="ping-health-bar"
                :style="{
                  ...barStyle(bucket, 'loss'),
                  borderBottomLeftRadius: idx === 0 ? '2px' : '0',
                  borderBottomRightRadius: idx === barCount - 1 ? '2px' : '0',
                }"
                @mouseenter="hoveredLossIndex = idx"
                @mouseleave="hoveredLossIndex = null"
              />
            </template>
            {{ formatBucketTooltip(idx, 'loss') }}
          </NTooltip>
        </div>
      </div>
    </template>
    <div v-else class="ping-health-placeholder">
      <NText :depth="3" class="text-xs">
        未配置首页 Ping
      </NText>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ping-health {
  display: flex;
  gap: 12px;
  padding: 4px 0;
}

.ping-health--compact {
  gap: 8px;
}

.ping-health-block {
  flex: 1;
  min-width: 0;
}

.ping-health-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.ping-health-label {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.ping-health-value {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
}

.ping-health-bars {
  display: flex;
  align-items: flex-end;
  gap: 1px;
  height: 14px;
}

.ping-health-bar {
  transform-origin: bottom;
  border-top-left-radius: 2px;
  border-top-right-radius: 2px;
  transition: background-color 180ms ease;
  min-width: 2px;
}

.ping-health-placeholder {
  padding: 6px 0;
}
</style>
