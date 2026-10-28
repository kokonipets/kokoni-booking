// Discount attribution for commission purposes.
//
// A coupon's discount can be absorbed by the store (groomer's commission is
// unaffected — calculated as if the discount never happened), by the groomer
// (commission is calculated on what was actually collected), or split evenly.
// The bearer is snapshotted onto the appointment when the discount is applied
// at checkout, so editing/deleting the coupon later never changes past pay.
export type DiscountBearer = 'store' | 'groomer' | 'split'

export const DISCOUNT_BEARER_OPTIONS: { value: DiscountBearer; label: string; hint: string }[] = [
  { value: 'store', label: 'Store pays', hint: "Groomer's commission is unaffected by this discount" },
  { value: 'groomer', label: 'Groomer pays', hint: 'Commission is calculated on the discounted price' },
  { value: 'split', label: 'Split 50/50', hint: 'Half the discount comes off the commission base' },
]

/**
 * The dollar amount commission should be calculated on, given what was
 * actually collected (payment_amount, i.e. post-discount) and how much
 * discount was applied. Appointments saved before this feature has no
 * discount_bearer on file — default to 'store', which matches how commission
 * was already being calculated on this project before per-coupon attribution
 * existed.
 */
export function commissionableAmount(
  paymentAmount: number,
  discountAmount: number,
  discountBearer?: string | null
): number {
  if (!discountAmount) return paymentAmount
  const bearer = (discountBearer || 'store') as DiscountBearer
  if (bearer === 'groomer') return paymentAmount
  if (bearer === 'split') return paymentAmount + discountAmount / 2
  return paymentAmount + discountAmount // 'store' (default)
}


// ── Effective-dated payroll rates ────────────────────────────────────────────
// staff.commission_percent / tip_percent hold the CURRENT rates; staff_rate_history holds each change
// with the date it takes effect, so a raise (or cut) only applies from that day forward.
export type RateHistoryRow = { effective_from: string; commission_percent: number; tip_percent: number }

/** The groomer's commission % and tip-share % that applied on `date` (YYYY-MM-DD). */
export function ratesOn(
  member: { commission_percent?: number | null; tip_percent?: number | null; rate_history?: RateHistoryRow[] | null } | null | undefined,
  date: string
): { commission: number; tip: number } {
  const cur = { commission: Number(member?.commission_percent ?? 0), tip: Number(member?.tip_percent ?? 0) }
  const h = (member?.rate_history ?? []).slice().sort((a, b) => a.effective_from.localeCompare(b.effective_from))
  if (!h.length) return cur
  let pick = h[0] // dates before the first entry use the earliest (baseline) rates
  for (const r of h) if (r.effective_from <= date) pick = r
  return { commission: Number(pick.commission_percent), tip: Number(pick.tip_percent) }
}

/** Best-effort load of all staff rate history (empty if the table isn't migrated yet). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadRateHistory(sb: any): Promise<Record<string, RateHistoryRow[]>> {
  const out: Record<string, RateHistoryRow[]> = {}
  try {
    const { data, error } = await sb.from('staff_rate_history').select('staff_id, effective_from, commission_percent, tip_percent')
    if (error || !data) return out
    for (const r of data as { staff_id: string; effective_from: string; commission_percent: number; tip_percent: number }[]) {
      (out[r.staff_id] ||= []).push({ effective_from: r.effective_from, commission_percent: Number(r.commission_percent), tip_percent: Number(r.tip_percent) })
    }
  } catch { /* table missing */ }
  return out
}
