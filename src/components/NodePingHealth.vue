<script setup lang="ts">
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

const pingItem = computed(() => pingStore.getItem(props.uuid))
const pingBuckets = computed(() => pingStore.getBuckets(props.uuid))

const latencyValue = computed(() => pingItem.value.lastValue)
const lossValue = computed(() => pingItem.value.loss)

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
</script>

<template>
  <div class="ping-health" :class="{ 'ping-health--compact': compact }">
    <div class="ping-health-heading">
      <span class="ping-health-title">网络质量</span>
      <span class="ping-health-window">最近 1 小时</span>
    </div>
    <div class="ping-health-grid">
      <PingHistoryStrip
        label="延迟"
        :value="latencyLabel"
        :value-color="latencyColor"
        :font-family="appStore.numberFontFamily"
        :buckets="pingBuckets"
        metric="latency"
        :compact="compact"
      />
      <PingHistoryStrip
        label="丢包"
        :value="lossLabel"
        :value-color="lossColor"
        :font-family="appStore.numberFontFamily"
        :buckets="pingBuckets"
        metric="loss"
        :compact="compact"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.ping-health {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
}

.ping-health--compact {
  gap: 6px;
}

.ping-health-heading {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.ping-health-title {
  color: var(--n-text-color-2);
  font-size: 12px;
  font-weight: 600;
}

.ping-health-window {
  color: var(--n-text-color-3);
  font-size: 10px;
}

.ping-health-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

@media (max-width: 380px) {
  .ping-health-grid {
    grid-template-columns: 1fr;
  }
}
</style>
