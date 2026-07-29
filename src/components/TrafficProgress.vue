<script setup lang="ts">
import { useThemeVars } from 'naive-ui'
import { computed } from 'vue'

export interface TrafficProgressProps {
  /** 上传流量（字节） */
  upload: number
  /** 下载流量（字节） */
  download: number
  /** 上传流量颜色（默认使用 success 色） */
  uploadColor?: string
  /** 下载流量颜色（默认使用 info 色） */
  downloadColor?: string
  /** 进度条高度 */
  height?: number | string
}

const props = withDefaults(defineProps<TrafficProgressProps>(), {
  uploadColor: undefined,
  downloadColor: undefined,
  height: undefined,
})

const themeVars = useThemeVars()

const total = computed(() => Math.max(0, props.upload) + Math.max(0, props.download))

const uploadPercentage = computed(() => {
  if (total.value <= 0)
    return 0
  return (Math.max(0, props.upload) / total.value) * 100
})

const downloadPercentage = computed(() => {
  if (total.value <= 0)
    return 0
  return (Math.max(0, props.download) / total.value) * 100
})

const progressHeight = computed(() => {
  if (props.height === undefined)
    return undefined
  return typeof props.height === 'number' ? `${props.height}px` : props.height
})

const resolvedUploadColor = computed(() => props.uploadColor || themeVars.value.successColor)
const resolvedDownloadColor = computed(() => props.downloadColor || themeVars.value.infoColor)
const railColor = computed(() => themeVars.value.progressRailColor)
</script>

<template>
  <div class="traffic-progress">
    <div class="traffic-progress__rail" :style="{ height: progressHeight, backgroundColor: railColor }">
      <div
        class="traffic-progress__fill traffic-progress__fill--first"
        :style="{
          width: `${uploadPercentage}%`,
          backgroundColor: resolvedUploadColor,
        }"
      />
      <div
        class="traffic-progress__fill traffic-progress__fill--last"
        :style="{
          width: `${downloadPercentage}%`,
          backgroundColor: resolvedDownloadColor,
        }"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.traffic-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;

  &__rail {
    position: relative;
    display: flex;
    overflow: hidden;
    height: 8px;
    border-radius: 5px;
    transition: background-color 0.3s;
  }

  &__fill {
    position: relative;
    height: 100%;
    transition:
      max-width 0.2s,
      width 0.2s,
      background-color 0.3s;

    &--first {
      border-top-left-radius: 5px;
      border-bottom-left-radius: 5px;
    }

    &--last {
      border-top-right-radius: 5px;
      border-bottom-right-radius: 5px;
    }
  }
}
</style>
