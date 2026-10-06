// Matches a customer's weight choice (e.g. "Medium (16–30 lbs)") to a service's size tier
// by the WEIGHT NUMBERS, not the exact label text. Settings labels drift from the booking
// buttons ("up to" vs "under", "XL" vs "XLarge", "16 – 30" vs "16–30"), and an exact-text
// miss used to silently fall back to the service's LONGEST tier — e.g. every Simply Cute
// booked as 2.5h, hiding the last good afternoon slots.

export type TierLike = { label: string; duration?: string }

const norm = (s: string) => s.toLowerCase().replace(/[‒-―−]/g, '-').replace(/\s+/g, '')

// "Small (under 15 lbs)" → [0,15] · "Medium (16 – 30 lbs)" → [16,30] · "up to 10 lbs" → [0,10]
export function parseWeightRange(label?: string | null): [number, number] | null {
  if (!label) return null
  const nums = (label.match(/\d+(?:\.\d+)?/g) || []).map(Number)
  if (nums.length >= 2) return [Math.min(nums[0], nums[1]), Math.max(nums[0], nums[1])]
  if (nums.length === 1) {
    if (/under|up\s*to|below|less|<|以下/i.test(label)) return [0, nums[0]]
    if (/over|above|\+|>|以上/i.test(label)) return [nums[0], 9999]
    return [nums[0], nums[0]]
  }
  return null
}

// Several tiers can share a weight range (Bath & Brush: Smooth / Long / Poodle coat).
// Salon rule: use the Smooth Coat time in that case.
const pickPreferred = <T extends TierLike>(cands: T[]): T | undefined =>
  cands.find(t => /smooth/i.test(t.label)) ?? cands[0]

export function matchTier<T extends TierLike>(tiers: T[] | undefined, sizeTier?: string | null): T | undefined {
  if (!tiers?.length || !sizeTier) return undefined
  const exact = tiers.filter(t => norm(t.label) === norm(sizeTier))
  if (exact.length) return pickPreferred(exact)

  const want = parseWeightRange(sizeTier)
  if (!want) return undefined
  const ranged = tiers.map(t => ({ t, r: parseWeightRange(t.label) })).filter(x => x.r)

  const same = ranged.filter(x => x.r![0] === want[0] && x.r![1] === want[1]).map(x => x.t)
  if (same.length) return pickPreferred(same)

  // Not identical (e.g. a pet saved as "up to 10 lbs", or "46–65" vs "51–70"):
  // use the tier whose range contains the middle of the customer's range.
  const mid = (want[0] + Math.min(want[1], 200)) / 2
  const containing = ranged.filter(x => mid >= x.r![0] && mid <= x.r![1]).map(x => x.t)
  return pickPreferred(containing)
}
