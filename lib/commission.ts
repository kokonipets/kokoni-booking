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


// ── Helper (partner) groomer ─────────────────────────────────────────────────
// The assigned groomer stays the owner of the appointment and can add a helper. The helper's pay comes OUT of the owner's
// earnings: either a one-time flat $ amount, or a % of the owner's commission and a % of the owner's tip share on that appointment.
export type HelperFields = {
  helper_groomer?: string | null
  helper_pay_type?: string | null
  helper_flat_amount?: number | string | null
  helper_commission_percent?: number | string | null
  helper_tip_percent?: number | string | null
  helper_status?: string | null
}

/** What the helper earns on this appointment (taken from the owner's commission / tip share). */
export function helperCut(a: HelperFields, ownerCommission: number, ownerTipShare: number): { comm: number; tip: number } {
  if (!a.helper_groomer) return { comm: 0, tip: 0 }
  // The assistant hasn't confirmed yet — no money moves until they accept
  if (a.helper_status === 'pending') return { comm: 0, tip: 0 }
  if (a.helper_pay_type === 'flat') return { comm: Number(a.helper_flat_amount || 0), tip: 0 }
  return {
    comm: ownerCommission * Number(a.helper_commission_percent || 0) / 100,
    tip: ownerTipShare * Number(a.helper_tip_percent || 0) / 100,
  }
}


// ── Stacked coupons ─────────────────────────────────────────────────────────
// Up to two coupons can be applied to one appointment (e.g. $25 + $50, or $50 + $50). Each is calculated on the
// pre-discount subtotal and the total discount can never exceed the subtotal. Only coupons with the same
// "who pays" (store / groomer / split) can be combined, so the commission rules in this file stay exact.
export type CouponLike = { id: string; name: string; discount_type: string; discount_value: number; discount_bearer?: string | null }

export function stackedCoupons(selected: (CouponLike | null | undefined)[], subtotal: number) {
  const list = selected.filter(Boolean) as CouponLike[]
  let total = 0
  for (const c of list) {
    total += c.discount_type === 'percent' ? Math.round(subtotal * c.discount_value / 100 * 100) / 100 : c.discount_value
  }
  total = Math.round(Math.min(total, subtotal) * 100) / 100
  return {
    amount: total,
    label: list.length ? list.map(c => c.name).join(' + ') : null,
    // a single percent coupon keeps its percent (so old reports keep working); stacked ones don't have one
    percent: list.length === 1 && list[0].discount_type === 'percent' ? String(list[0].discount_value) : null,
    bearer: list[0]?.discount_bearer || 'store',
  }
}

/** Rebuild the selected coupons from a saved label like "Coupon 25 + Coupon 50" (falls back to a matching percent). */
// The coupon an appointment was booked with via a promo link (?promo=CODE →
// appointments.promo_code), if it's still an active coupon in the list and the
// appointment hasn't been paid yet. Checkout screens pre-select it so staff
// don't have to remember the promo. Returns undefined when there's nothing to apply.
export function promoCouponFor<T extends CouponLike & { code?: string | null }>(
  appt: { promo_code?: string | null; payment_status?: string | null },
  coupons: T[]
): T | undefined {
  const code = (appt.promo_code || '').trim().toUpperCase()
  if (!code || (appt.payment_status || '').toLowerCase() === 'paid') return undefined
  return coupons.find(c => (c.code || '').trim().toUpperCase() === code)
}

export function restoreCoupons<T extends CouponLike>(label: string | null | undefined, percent: number, coupons: T[]): T[] {
  const parts = (label ?? '').split(' + ').map(x => x.trim()).filter(Boolean)
  const found = parts.map(n => coupons.find(c => c.name === n)).filter(Boolean) as T[]
  if (found.length > 0) return found.slice(0, 2)
  if (!isNaN(percent)) {
    const m = coupons.find(c => c.discount_type === 'percent' && c.discount_value === percent)
    if (m) return [m]
  }
  return []
}
