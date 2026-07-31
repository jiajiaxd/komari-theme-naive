import type { HomepagePingTaskBindings } from '@/types/komari'

// 三网模式固定的展示任务数量（与 LuminaPlus 对齐）
export const HOMEPAGE_MULTI_PING_TASK_COUNT = 3

function parseJsonConfigValue(value: unknown): unknown {
  if (typeof value !== 'string')
    return value
  try {
    return JSON.parse(value)
  }
  catch {
    return null
  }
}

function parseTaskId(taskId: string): number | null {
  if (!/^\d+$/.test(taskId))
    return null
  const parsed = Number(taskId)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

// 规范化三网模式的任务 ID 数组，最多保留 HOMEPAGE_MULTI_PING_TASK_COUNT 个唯一正整数
export function normalizeHomepageMultiPingTaskIds(value: unknown): number[] {
  const parsedValue = parseJsonConfigValue(value)
  if (!Array.isArray(parsedValue))
    return []

  const normalized: number[] = []
  for (const raw of parsedValue) {
    const taskId
      = typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0
        ? raw
        : typeof raw === 'string'
          ? parseTaskId(raw)
          : null
    if (taskId == null || normalized.includes(taskId))
      continue
    normalized.push(taskId)
    if (normalized.length === HOMEPAGE_MULTI_PING_TASK_COUNT)
      break
  }
  return normalized
}

export function normalizeHomepagePingTaskBindings(
  value: unknown,
): HomepagePingTaskBindings {
  const parsedValue = parseJsonConfigValue(value)
  if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
    return {}
  }

  const normalized: HomepagePingTaskBindings = {}
  for (const [taskId, clients] of Object.entries(parsedValue)) {
    const numericTaskId = parseTaskId(taskId)
    if (numericTaskId == null || !Array.isArray(clients))
      continue

    const uniqueClients = Array.from(
      new Set(
        clients
          .map(client => (typeof client === 'string' ? client.trim() : ''))
          .filter(Boolean),
      ),
    )
    if (uniqueClients.length === 0)
      continue

    const normalizedTaskId = String(numericTaskId)
    normalized[normalizedTaskId] = Array.from(
      new Set([...(normalized[normalizedTaskId] ?? []), ...uniqueClients]),
    )
  }

  return normalized
}

export function invertHomepagePingTaskBindings(
  bindings: HomepagePingTaskBindings,
): Map<string, number> {
  const selectedTaskByClient = new Map<string, number>()

  for (const [taskId, clients] of Object.entries(bindings)) {
    const numericTaskId = parseTaskId(taskId)
    if (numericTaskId == null)
      continue
    for (const client of clients) {
      if (!selectedTaskByClient.has(client)) {
        selectedTaskByClient.set(client, numericTaskId)
      }
    }
  }

  return selectedTaskByClient
}

export function collectAllTaskIds(bindings: HomepagePingTaskBindings): number[] {
  return Object.keys(bindings)
    .map(key => parseTaskId(key))
    .filter((id): id is number => id != null)
}

// 把"按节点: 任务"视图反转为"任务: [uuids]"字符串形式，用于序列化输出
export function invertToTaskBindings(map: Map<string, number>): HomepagePingTaskBindings {
  const result: HomepagePingTaskBindings = {}
  for (const [uuid, taskId] of map) {
    if (!uuid)
      continue
    const key = String(taskId)
    const list = result[key] ?? []
    if (!list.includes(uuid))
      list.push(uuid)
    result[key] = list
  }
  return result
}

// 计算每个客户端实际应该请求的任务 ID 列表（single/multi 两路径）
export function resolveHomepagePingTaskIdsByClient(
  clientUuids: string[],
  bindings: HomepagePingTaskBindings,
  multiTaskIds: number[] = [],
): Map<string, number[]> {
  const selectedTaskIds = normalizeHomepageMultiPingTaskIds(multiTaskIds)
  const selectedTaskIdsByClient = new Map<string, number[]>()

  if (selectedTaskIds.length === HOMEPAGE_MULTI_PING_TASK_COUNT) {
    for (const uuid of clientUuids) {
      if (uuid)
        selectedTaskIdsByClient.set(uuid, selectedTaskIds)
    }
    return selectedTaskIdsByClient
  }

  const singleTaskByClient = invertHomepagePingTaskBindings(bindings)
  for (const uuid of clientUuids) {
    const taskId = singleTaskByClient.get(uuid)
    if (taskId != null)
      selectedTaskIdsByClient.set(uuid, [taskId])
  }
  return selectedTaskIdsByClient
}

export function resolveHomepagePingSelections(
  clientUuids: string[],
  bindings: HomepagePingTaskBindings,
  multiTaskIds: number[] = [],
): {
  singleTaskIdsByClient: Map<string, number[]>
  multiTaskIdsByClient: Map<string, number[]>
  requestedTaskIdsByClient: Map<string, number[]>
} {
  const normalizedMultiTaskIds = normalizeHomepageMultiPingTaskIds(multiTaskIds)
  const useMultiPing = normalizedMultiTaskIds.length === HOMEPAGE_MULTI_PING_TASK_COUNT
  const singleTaskIdsByClient = useMultiPing
    ? new Map<string, number[]>()
    : resolveHomepagePingTaskIdsByClient(clientUuids, bindings)
  const multiTaskIdsByClient = useMultiPing
    ? resolveHomepagePingTaskIdsByClient(clientUuids, {}, normalizedMultiTaskIds)
    : new Map<string, number[]>()

  return {
    singleTaskIdsByClient,
    multiTaskIdsByClient,
    requestedTaskIdsByClient: useMultiPing ? multiTaskIdsByClient : singleTaskIdsByClient,
  }
}

export function resolvePingSampleCounts(
  sample: { value: number, count?: number, loss?: number },
): { total: number, lost: number, valid: number } {
  const total
    = typeof sample.count === 'number' && Number.isFinite(sample.count) && sample.count > 0
      ? Math.max(1, Math.round(sample.count))
      : 1
  const reportedLoss = sample.loss
  const lost
    = typeof reportedLoss === 'number' && Number.isFinite(reportedLoss)
      ? Math.min(total, Math.max(0, Math.round((reportedLoss / 100) * total)))
      : sample.value < 0
        ? total
        : 0
  return { total, lost, valid: total - lost }
}
