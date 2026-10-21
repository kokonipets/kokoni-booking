// Sales tax for counter retail sales (店販). Kokoni is in San Gabriel, CA (Los Angeles County):
// combined rate 11.00% effective Oct 1, 2026 (CDTFA notice L-1037; was 10.50%).
// Item sale_price values are PRE-tax; tax is added at checkout.
export const RETAIL_TAX_RATE = 0.11

export function withTax(subtotal: number) {
  const sub = Math.round(subtotal * 100) / 100
  const tax = Math.round(sub * RETAIL_TAX_RATE * 100) / 100
  return { subtotal: sub, tax, total: Math.round((sub + tax) * 100) / 100 }
}
