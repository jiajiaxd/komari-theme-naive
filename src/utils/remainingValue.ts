import type { NodeData } from '@/stores/nodes'
import { convertToCNY, ensureExchangeRates, getCnyRate, resolveCurrencyCode } from '@/utils/exchangeRate'
import {
  buildRemainingValueReport,
  formatPrice,
  formatRemainingValue,
  getRemainingValue,
} from '@/utils/tagHelper'

export interface RemainingValueView {
  text: string
  remainingOriginal: number
  remainingCny: number
  priceCny: number
  rate: number
  currencyCode: string
  /** 是否已成功换算为人民币 */
  converted: boolean
}

/**
 * 计算节点剩余价值展示数据（优先换算为人民币）
 */
export function getRemainingValueView(
  node: Pick<NodeData, 'price' | 'billing_cycle' | 'currency' | 'expired_at'>,
  lang: 'zh-CN' | 'en-US' = 'zh-CN',
): RemainingValueView | null {
  const remainingOriginal = getRemainingValue(node.price, node.billing_cycle, node.expired_at)
  if (remainingOriginal === null)
    return null

  const code = resolveCurrencyCode(node.currency)
  const rate = getCnyRate(node.currency)
  const remainingConversion = convertToCNY(remainingOriginal, node.currency)
  const priceConversion = convertToCNY(node.price, node.currency)

  // 汇率未就绪且非人民币时，暂时按原币种展示，避免错误换算
  if (rate === null || !remainingConversion || !priceConversion) {
    const amountText = formatPrice(Number(remainingOriginal.toFixed(2)), node.currency || code, lang)
    return {
      text: lang === 'zh-CN' ? `剩余价值 ${amountText}` : `Residual ${amountText}`,
      remainingOriginal,
      remainingCny: remainingOriginal,
      priceCny: node.price,
      rate: 1,
      currencyCode: code,
      converted: code === 'CNY',
    }
  }

  return {
    text: formatRemainingValue(remainingConversion.amountCny, lang),
    remainingOriginal,
    remainingCny: remainingConversion.amountCny,
    priceCny: priceConversion.amountCny,
    rate,
    currencyCode: code,
    converted: true,
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  }
  catch {
    // fallback below
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  }
  catch {
    return false
  }
}

/**
 * 生成并复制节点剩余价值报告
 */
export async function copyRemainingValueReport(
  node: Pick<NodeData, 'price' | 'billing_cycle' | 'currency' | 'expired_at'>,
): Promise<boolean> {
  try {
    await ensureExchangeRates()
  }
  catch {
    // 继续用已有缓存或 1:1
  }

  const view = getRemainingValueView(node, 'zh-CN')
  if (!view)
    return false

  const report = buildRemainingValueReport({
    price: node.price,
    billingCycle: node.billing_cycle,
    currency: node.currency,
    expiredAt: node.expired_at,
    remainingOriginal: view.remainingOriginal,
    priceCny: view.priceCny,
    remainingCny: view.remainingCny,
    rate: view.rate,
  })

  return copyText(report)
}
