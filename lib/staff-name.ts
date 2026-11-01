// Staff are matched on FIRST NAME only, so "Wylie" and "Wylie Shen" are the same person everywhere
// (appointments sometimes store the short name while the staff record has the full name).
export const firstName = (n?: string | null) => (n ?? '').trim().split(/\s+/)[0].toLowerCase()

export const sameStaff = (a?: string | null, b?: string | null) => !!a && !!b && (a === b || (!!firstName(a) && firstName(a) === firstName(b)))

/** Map a stored name ("Wylie") to the staff record's full name ("Wylie Shen"); returns the input if no match. */
export const canonicalStaffName = (n: string | null | undefined, staffNames: string[]): string | null =>
  n ? (staffNames.find(s => sameStaff(s, n)) ?? n) : null

/** How a staff name is shown in the UI: first name only ("Wylie Shen" → "Wylie"). */
export const displayName = (n?: string | null) => (n ?? '').trim().split(/\s+/)[0]
