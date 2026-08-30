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
