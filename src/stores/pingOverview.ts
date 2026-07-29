import type { PingOverviewItem, PingRecordsResult } from '@/types/komari'
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { buildPingBuckets, buildPingOverviewItems } from '@/utils/pingOverview'
import { collectAllTaskIds } from '@/utils/pingTasks'
import { getSharedRpc } from '@/utils/rpc'

const DEFAULT_PING_REFRESH_INTERVAL_MS = 60_000
const MIN_PING_REFRESH_INTERVAL_MS = 10_000
const MAX_PING_REFRESH_INTERVAL_MS = 150_000

const EMPTY_PING: PingOverviewItem = {
  client: '',
  isAssigned: false,
  lastValue: null,
  samples: [],
  max: 1,
  loss: null,
}

const usePingOverviewStore = defineStore('pingOverview', () => {
  const pingMap = shallowRef<Map<string, PingOverviewItem>>(new Map())

  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let abortController: AbortController | null = null
  let refreshInFlight = false
  let consumers = 0

  function getItem(uuid: string): PingOverviewItem {
    return pingMap.value.get(uuid) ?? EMPTY_PING
  }

  function getBuckets(uuid: string) {
    return buildPingBuckets(getItem(uuid))
  }

  async function fetchForTask(taskId: number): Promise<PingRecordsResult | null> {
    try {
      const rpc = getSharedRpc()
      return await rpc.getRecords<PingRecordsResult>({
        type: 'ping',
        hours: 1,
        task_id: taskId,
        maxCount: 2000,
      })
    }
    catch {
      return null
    }
  }

  function scheduleRefresh(intervalMs: number) {
    if (refreshTimer != null)
      clearTimeout(refreshTimer)
    if (consumers <= 0)
      return
    const clamped = Math.min(MAX_PING_REFRESH_INTERVAL_MS, Math.max(MIN_PING_REFRESH_INTERVAL_MS, intervalMs))
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      void doRefresh()
    }, clamped)
  }

  function stopPingPolling() {
    if (refreshTimer != null) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  async function doRefresh() {
    if (refreshInFlight)
      return

    const appStore = useAppStore()
    const nodesStore = useNodesStore()

    if (!appStore.showHomepagePing) {
      pingMap.value = new Map()
      scheduleRefresh(DEFAULT_PING_REFRESH_INTERVAL_MS)
      return
    }

    const bindings = appStore.homepagePingBindings
    const visibleUuids = nodesStore.nodes.filter(n => !n.hidden).map(n => n.uuid)

    if (visibleUuids.length === 0 || Object.keys(bindings).length === 0) {
      pingMap.value = new Map()
      scheduleRefresh(DEFAULT_PING_REFRESH_INTERVAL_MS)
      return
    }

    refreshInFlight = true
    const controller = new AbortController()
    abortController = controller
    const { signal } = controller

    try {
      const taskIds = collectAllTaskIds(bindings)
      const results = await Promise.allSettled(
        taskIds.map(taskId => fetchForTask(taskId)),
      )

      if (signal.aborted)
        return

      const nextMap = new Map<string, PingOverviewItem>()

      for (let i = 0; i < taskIds.length; i++) {
        const result = results[i]
        if (result?.status !== 'fulfilled' || !result.value)
          continue

        const taskId = taskIds[i]
        if (taskId == null)
          continue
        const items = buildPingOverviewItems(taskId, result.value.records ?? [])
        for (const [uuid, item] of items) {
          if (!nextMap.has(uuid) || !nextMap.get(uuid)?.isAssigned) {
            nextMap.set(uuid, item)
          }
        }
      }

      pingMap.value = nextMap
      scheduleRefresh(DEFAULT_PING_REFRESH_INTERVAL_MS)
    }
    catch {
      scheduleRefresh(DEFAULT_PING_REFRESH_INTERVAL_MS)
    }
    finally {
      refreshInFlight = false
      if (abortController === controller)
        abortController = null
    }
  }

  function retain(): () => void {
    consumers += 1
    let released = false
    if (consumers === 1) {
      void doRefresh()
    }
    return () => {
      if (released)
        return
      released = true
      consumers = Math.max(0, consumers - 1)
      if (consumers <= 0) {
        consumers = 0
        stopPingPolling()
      }
    }
  }

  return {
    pingMap,
    getItem,
    getBuckets,
    doRefresh,
    retain,
    stopPingPolling,
  }
})

export { usePingOverviewStore }
