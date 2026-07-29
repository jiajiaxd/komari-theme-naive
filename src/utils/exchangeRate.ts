import { ref } from 'vue'

/** 1 单位该货币 = 多少人民币 */
export type CnyRateMap = Record<string, number>

const CACHE_KEY = 'komari-naive-exchange-rates-v1'
const CACHE_TTL_MS = 12 * 60 * 60 * 1000

/** 触发依赖汇率的计算属性刷新 */
export const exchangeRateVersion = ref(0)

let ratesToCny: CnyRateMap = { CNY: 1 }
let loadingPromise: Promise<void> | null = null
let lastFetchedAt = 0

const SYMBOL_TO_CODE: Array<{ match: RegExp, code: string }> = [
  { match: /^(cny|rmb|cnh)$/i, code: 'CNY' },
  { match: /^(usd|us\$)$/i, code: 'USD' },
  { match: /^(eur|euro)$/i, code: 'EUR' },
  { match: /^(gbp|pound)$/i, code: 'GBP' },
  { match: /^(jpy|yen|円)$/i, code: 'JPY' },
  { match: /^(hkd|hk\$)$/i, code: 'HKD' },
  { match: /^(twd|nt\$|nt)$/i, code: 'TWD' },
  { match: /^(sgd|s\$)$/i, code: 'SGD' },
  { match: /^(krw|won)$/i, code: 'KRW' },
  { match: /^(aud|a\$)$/i, code: 'AUD' },
  { match: /^(cad|c\$)$/i, code: 'CAD' },
  { match: /^(rub|₽)$/i, code: 'RUB' },
  { match: /^(inr|₹)$/i, code: 'INR' },
  { match: /^(chf)$/i, code: 'CHF' },
  { match: /^(thb|฿)$/i, code: 'THB' },
  { match: /^(vnd|₫)$/i, code: 'VND' },
  { match: /^(myr)$/i, code: 'MYR' },
  { match: /^(php|₱)$/i, code: 'PHP' },
  { match: /^(idr|rp)$/i, code: 'IDR' },
  { match: /^(try|₺)$/i, code: 'TRY' },
  { match: /^(brl|r\$)$/i, code: 'BRL' },
  { match: /^(mxn)$/i, code: 'MXN' },
  { match: /^(nzd)$/i, code: 'NZD' },
  { match: /^(pln|zł)$/i, code: 'PLN' },
  { match: /^(sek)$/i, code: 'SEK' },
  { match: /^(nok)$/i, code: 'NOK' },
  { match: /^(dkk)$/i, code: 'DKK' },
  { match: /^(czk)$/i, code: 'CZK' },
  { match: /^(huf)$/i, code: 'HUF' },
  { match: /^(ils|₪)$/i, code: 'ILS' },
  { match: /^(aed)$/i, code: 'AED' },
  { match: /^(sar)$/i, code: 'SAR' },
  { match: /^(zar)$/i, code: 'ZAR' },
  { match: /^[￥¥]$/, code: 'CNY' },
  { match: /^\$/, code: 'USD' },
  { match: /^€/, code: 'EUR' },
  { match: /^£/, code: 'GBP' },
]

/**
 * 将 Komari 的 currency 字段解析为 ISO 4217 代码
 */
export function resolveCurrencyCode(currency: string | undefined | null): string {
  const raw = (currency ?? '').trim()
  if (!raw)
    return 'CNY'

  const compact = raw.replace(/\s+/g, '')
  for (const item of SYMBOL_TO_CODE) {
    if (item.match.test(compact))
      return item.code
  }

  const upper = compact.toUpperCase()
  if (/^[A-Z]{3}$/.test(upper))
    return upper

  return 'CNY'
}

function readCache(): { rates: CnyRateMap, fetchedAt: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw)
      return null
    const parsed = JSON.parse(raw) as { rates?: CnyRateMap, fetchedAt?: number }
    if (!parsed.rates || typeof parsed.fetchedAt !== 'number')
      return null
    return { rates: { CNY: 1, ...parsed.rates }, fetchedAt: parsed.fetchedAt }
  }
  catch {
    return null
  }
}

function writeCache(rates: CnyRateMap, fetchedAt: number): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ rates, fetchedAt }))
  }
  catch {
    // ignore quota errors
  }
}

function applyRates(rates: CnyRateMap, fetchedAt: number): void {
  ratesToCny = { CNY: 1, ...rates }
  lastFetchedAt = fetchedAt
  writeCache(ratesToCny, fetchedAt)
  exchangeRateVersion.value += 1
}

function buildRatesFromUsdMap(usdRates: Record<string, number>): CnyRateMap | null {
  const cnyPerUsd = usdRates.CNY ?? usdRates.cny
  if (!cnyPerUsd || cnyPerUsd <= 0)
    return null

  const result: CnyRateMap = { CNY: 1, USD: cnyPerUsd }
  for (const [codeRaw, perUsd] of Object.entries(usdRates)) {
    const code = codeRaw.toUpperCase()
    if (code === 'CNY' || code === 'USD' || !(perUsd > 0))
      continue
    // 1 CODE = (CNY per USD) / (CODE per USD) CNY
    result[code] = cnyPerUsd / perUsd
  }
  return result
}

async function fetchFromOpenErApi(): Promise<CnyRateMap | null> {
  const response = await fetch('https://open.er-api.com/v6/latest/USD')
  if (!response.ok)
    throw new Error(`open.er-api HTTP ${response.status}`)
  const data = await response.json() as { result?: string, rates?: Record<string, number> }
  if (data.result !== 'success' || !data.rates)
    throw new Error('open.er-api invalid payload')
  return buildRatesFromUsdMap(data.rates)
}

async function fetchFromFawazApi(): Promise<CnyRateMap | null> {
  const response = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json')
  if (!response.ok)
    throw new Error(`fawaz currency API HTTP ${response.status}`)
  const data = await response.json() as { usd?: Record<string, number> }
  if (!data.usd)
    throw new Error('fawaz currency API invalid payload')
  return buildRatesFromUsdMap(data.usd)
}

/**
 * 确保汇率可用（带本地缓存，默认 12 小时）
 */
export async function ensureExchangeRates(force = false): Promise<void> {
  const now = Date.now()
  if (!force && lastFetchedAt > 0 && now - lastFetchedAt < CACHE_TTL_MS)
    return

  if (!force) {
    const cached = readCache()
    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
      ratesToCny = cached.rates
      lastFetchedAt = cached.fetchedAt
      exchangeRateVersion.value += 1
      return
    }
  }

  if (loadingPromise)
    return loadingPromise

  loadingPromise = (async () => {
    try {
      let rates: CnyRateMap | null = null
      try {
        rates = await fetchFromOpenErApi()
      }
      catch (error) {
        console.warn('[exchangeRate] open.er-api failed, trying fallback', error)
        rates = await fetchFromFawazApi()
      }
      if (!rates)
        throw new Error('Unable to build CNY rates')
      applyRates(rates, Date.now())
    }
    finally {
      loadingPromise = null
    }
  })()

  return loadingPromise
}

/**
 * 获取 1 单位货币兑人民币汇率；未知货币返回 null
 */
export function getCnyRate(currency: string | undefined | null): number | null {
  // 依赖版本号，便于 computed 追踪
  void exchangeRateVersion.value
  const code = resolveCurrencyCode(currency)
  if (code === 'CNY')
    return 1
  const rate = ratesToCny[code]
  return typeof rate === 'number' && rate > 0 ? rate : null
}

export interface CnyConversion {
  code: string
  rate: number
  amountCny: number
}

/**
 * 将金额转换为人民币
 */
export function convertToCNY(amount: number, currency: string | undefined | null): CnyConversion | null {
  const code = resolveCurrencyCode(currency)
  const rate = getCnyRate(currency)
  if (rate === null)
    return null
  return {
    code,
    rate,
    amountCny: amount * rate,
  }
}

/**
 * 启动时预加载汇率（不阻塞 UI）
 */
export function preloadExchangeRates(): void {
  const cached = readCache()
  if (cached) {
    ratesToCny = cached.rates
    lastFetchedAt = cached.fetchedAt
    exchangeRateVersion.value += 1
  }
  void ensureExchangeRates().catch((error) => {
    console.warn('[exchangeRate] preload failed', error)
  })
}
