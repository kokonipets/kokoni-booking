// Promo codes whose booking LINK (/book?promo=CODE) is turned off.
// Booking from an old link (or after receiving the announcement text) no
// longer attaches the code to the appointment, so checkout won't pre-select
// it. The coupon itself stays active: staff can still pick it by hand at
// checkout. Remove a code from this list to turn its link back on.
export const DISABLED_PROMO_LINKS = ['DOUBLE11']

export function isPromoLinkDisabled(code: string | null | undefined): boolean {
  const c = (code || '').trim().toUpperCase()
  return !!c && DISABLED_PROMO_LINKS.includes(c)
}
