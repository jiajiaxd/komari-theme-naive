import type { PingOverviewBucket, PingOverviewItem, PingRecord } from '@/types/komari'
import { resolvePingSampleCounts } from '@/utils/pingTasks'

export const MAX_VISIBLE_HOMEPAGE_PING_BUCKETS = 24
const TOTAL_WINDOW_MS = 60 * 60 * 1000

function toTimestamp(value: string | number): number {
  if (typeof value === 'number') {
    return value > 1_000_000_000_000 ? value : value * 1000
  }
  const parsed = Date.parse(String(value))
  return Number.isNaN(parsed) ? 0 : parsed
}

export function buildPingOverviewItems(
  taskId: number,
  records: PingRecord[],
): Map<string, PingOverviewItem> {
  const selectedRecords = records.filter(record => record.task_id === taskId)
  const grouped = new Map<string, PingRecord[]>()
  const lossStatsByClient = new Map<string, { total: number, lost: number }>()

  for (const record of selectedRecords) {
    if (!record.client)
      continue
    const current = grouped.get(record.client)
    if (current)
      current.push(record)
    else
      grouped.set(record.client, [record])

    const stats = lossStatsByClient.get(record.client) ?? { total: 0, lost: 0 }
    const counts = resolvePingSampleCounts(record)
    stats.total += counts.total
    stats.lost += counts.lost
    lossStatsByClient.set(record.client, stats)
  }

  const result = new Map<string, PingOverviewItem>()
  for (const [client, clientRecords] of grouped) {
    const sorted = [...clientRecords].sort(
      (left, right) => toTimestamp(left.time) - toTimestamp(right.time),
    )
    const latestRecord = sorted[sorted.length - 1]
    const samples: PingOverviewItem['samples'] = []
    let max = 1

    for (const record of sorted) {
      const value = record.value
      const time = toTimestamp(record.time)
      if (time > 0) {
        samples.push({
          time,
          value,
          count: record.count,
          loss: record.loss,
        })
      }
      if (value > max)
        max = value
    }

    const lossStats = lossStatsByClient.get(client)
    result.set(client, {
      client,
      isAssigned: true,
      lastValue:
        latestRecord && latestRecord.value >= 0 ? latestRecord.value : null,
      samples,
      max,
      loss:
        lossStats && lossStats.total > 0
          ? (lossStats.lost / lossStats.total) * 100
          : null,
    })
  }

  return result
}

export function buildPingBuckets(
  ping: Pick<PingOverviewItem, 'samples'>,
  count?: number,
  now?: number,
): PingOverviewBucket[] {
  const nowMs = now ?? Date.now()
  const resolvedCount = count ?? MAX_VISIBLE_HOMEPAGE_PING_BUCKETS
  const boundedCount = Number.isFinite(resolvedCount) && resolvedCount > 0
    ? Math.min(240, Math.max(1, Math.round(resolvedCount)))
    : MAX_VISIBLE_HOMEPAGE_PING_BUCKETS

  const bucketMs = TOTAL_WINDOW_MS / boundedCount
  const windowStart = nowMs - TOTAL_WINDOW_MS
  const totals: number[] = Array.from<number>({ length: boundedCount }).fill(0)
  const losts: number[] = Array.from<number>({ length: boundedCount }).fill(0)
  const positiveSums: number[] = Array.from<number>({ length: boundedCount }).fill(0)
  const positiveCounts: number[] = Array.from<number>({ length: boundedCount }).fill(0)

  for (const sample of ping.samples ?? []) {
    if (sample.time < windowStart || sample.time > nowMs)
      continue

    let bucketIndex = Math.floor((sample.time - windowStart) / bucketMs)
    if (bucketIndex < 0)
      continue
    if (bucketIndex >= boundedCount)
      bucketIndex = boundedCount - 1

    const { total, lost, valid } = resolvePingSampleCounts(sample)
    const t = totals[bucketIndex]
    const l = losts[bucketIndex]
    const ps = positiveSums[bucketIndex]
    const pc = positiveCounts[bucketIndex]
    if (t != null)
      totals[bucketIndex] = t + total
    if (l != null)
      losts[bucketIndex] = l + lost
    if (sample.value >= 0 && valid > 0) {
      if (ps != null)
        positiveSums[bucketIndex] = ps + sample.value * valid
      if (pc != null)
        positiveCounts[bucketIndex] = pc + valid
    }
  }

  return Array.from({ length: boundedCount }, (_, index) => {
    const startAt = windowStart + index * bucketMs
    const endAt = startAt + bucketMs
    const total = totals[index] ?? 0
    const lost = Math.round(losts[index] ?? 0)
    const positiveCount = positiveCounts[index] ?? 0

    const value = positiveCount > 0 ? (positiveSums[index] ?? 0) / positiveCount : null
    const loss: number | null = total > 0 ? (lost / total) * 100 : null

    return {
      index,
      value,
      loss,
      total,
      lost,
      startAt,
      endAt,
    }
  })
}

export function latencyHeatColor(value: number | null): string {
  if (value == null || value < 0)
    return 'var(--n-text-color-3)'
  if (value <= 30)
    return '#22c55e'
  if (value <= 80)
    return '#eab308'
  if (value <= 200)
    return '#f97316'
  return '#ef4444'
}

export function lossHeatColor(value: number | null): string {
  if (value == null || value < 0)
    return 'var(--n-text-color-3)'
  if (value === 0)
    return '#22c55e'
  if (value <= 1)
    return '#eab308'
  if (value <= 5)
    return '#f97316'
  return '#ef4444'
}
