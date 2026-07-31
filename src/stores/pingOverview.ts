import type { PingOverviewItem, PingOverviewLine, PingRecordsResult } from '@/types/komari'
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { buildPingBuckets, buildPingOverviewItems } from '@/utils/pingOverview'
import { resolveHomepagePingSelections } from '@/utils/pingTasks'
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

const EMPTY_LINES: PingOverviewLine[] = []

const usePingOverviewStore = defineStore('pingOverview', () => {
  const pingMap = shallowRef<Map<string, PingOverviewItem>>(new Map())
  const pingLinesMap = shallowRef<Map<string, PingOverviewLine[]>>(new Map())

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

  function getLines(uuid: string): PingOverviewLine[] {
    return pingLinesMap.value.get(uuid) ?? EMPTY_LINES
  }

  function getLineBuckets(line: PingOverviewLine) {
    return buildPingBuckets(line.item)
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
      pingLinesMap.value = new Map()
      scheduleRefresh(DEFAULT_PING_REFRESH_INTERVAL_MS)
      return
    }

    const useMulti = appStore.useHomepageMultiPing
    const bindings = appStore.homepagePingBindings
    const multiTaskIds = appStore.homepageMultiPingTaskIds
    const visibleUuids = nodesStore.nodes.filter(n => !n.hidden).map(n => n.uuid)

    const hasBindings = useMulti
      ? multiTaskIds.length > 0
      : Object.keys(bindings).length > 0

    if (visibleUuids.length === 0 || !hasBindings) {
      pingMap.value = new Map()
      pingLinesMap.value = new Map()
      scheduleRefresh(DEFAULT_PING_REFRESH_INTERVAL_MS)
      return
    }

    refreshInFlight = true
    const controller = new AbortController()
    abortController = controller
    const { signal } = controller

    try {
      const selections = resolveHomepagePingSelections(visibleUuids, bindings, multiTaskIds)
      const requestedTaskIdsByClient = selections.requestedTaskIdsByClient
      // 收集去重后的全部 taskId
      const taskIds = Array.from(
        new Set(Array.from(requestedTaskIdsByClient.values()).flat()),
      )

      const results = await Promise.allSettled(
        taskIds.map(taskId => fetchForTask(taskId)),
      )

      if (signal.aborted)
        return

      // taskId -> 任务名（尝试从任一响应里的 tasks 字段解析）
      const taskNameByTaskId = new Map<number, string>()
      for (const result of results) {
        if (result?.status !== 'fulfilled' || !result.value)
          continue
        for (const task of result.value.tasks ?? []) {
          if (!taskNameByTaskId.has(task.id))
            taskNameByTaskId.set(task.id, task.name || `任务 #${task.id}`)
        }
      }

      // taskId -> (uuid -> item)
      const itemsByTask = new Map<number, Map<string, PingOverviewItem>>()
      for (let i = 0; i < taskIds.length; i++) {
        const taskId = taskIds[i]
        if (taskId == null)
          continue
        const result = results[i]
        if (result?.status !== 'fulfilled' || !result.value)
          continue
        itemsByTask.set(taskId, buildPingOverviewItems(taskId, result.value.records ?? []))
      }

      // single 路径：每个 uuid 取其唯一任务，未成功则空占位
      const nextSingleMap = new Map<string, PingOverviewItem>()
      for (const [uuid, taskIds] of selections.singleTaskIdsByClient) {
        const taskId = taskIds[0]
        if (taskId == null)
          continue
        const itemsForTask = itemsByTask.get(taskId)
        const item = itemsForTask?.get(uuid)
        if (item) {
          nextSingleMap.set(uuid, item)
        }
        else {
          nextSingleMap.set(uuid, { ...EMPTY_PING, client: uuid, isAssigned: true })
        }
      }

      // multi 路径：每个 uuid 组装多条 line，单条失败则空占位
      const nextMultiMap = new Map<string, PingOverviewLine[]>()
      for (const [uuid, taskIds] of selections.multiTaskIdsByClient) {
        const lines: PingOverviewLine[] = taskIds.map((taskId) => {
          const taskName = taskNameByTaskId.get(taskId) ?? `任务 #${taskId}`
          const item = itemsByTask.get(taskId)?.get(uuid)
          return {
            taskId,
            taskName,
            item: item ?? { ...EMPTY_PING, client: uuid, isAssigned: true },
          }
        })
        nextMultiMap.set(uuid, lines)
      }

      pingMap.value = nextSingleMap
      pingLinesMap.value = nextMultiMap
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
    pingLinesMap,
    getItem,
    getBuckets,
    getLines,
    getLineBuckets,
    doRefresh,
    retain,
    stopPingPolling,
  }
})

export { usePingOverviewStore }
