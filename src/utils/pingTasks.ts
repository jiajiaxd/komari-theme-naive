import type { HomepagePingTaskBindings } from '@/types/komari'

function parseTaskId(taskId: string): number | null {
  if (!/^\d+$/.test(taskId))
    return null
  const parsed = Number(taskId)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function normalizeHomepagePingTaskBindings(
  value: unknown,
): HomepagePingTaskBindings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const normalized: HomepagePingTaskBindings = {}
  for (const [taskId, clients] of Object.entries(value)) {
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
