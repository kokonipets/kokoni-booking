import type { SupabaseClient } from '@supabase/supabase-js'

// Finalize a retail sale exactly once: flips pending -> paid, then writes one inventory
// 'out' movement per line. Safe to call repeatedly / from several places (admin poll,
// kiosk reconcile) — only the call that wins the pending -> paid update writes movements.
export async function finalizeRetailSale(supabase: SupabaseClient, saleId: string): Promise<boolean> {
  const { data: won } = await supabase
    .from('retail_sales')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', saleId)
    .eq('status', 'pending')
    .select('id, lines, payment_method')
  if (!won || won.length === 0) return false

  const sale = won[0] as { id: string; payment_method: string; lines: { item_id: string; qty: number; unit_price: number }[] }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  await supabase.from('inventory_movements').insert(
    sale.lines.map(l => ({
      item_id: l.item_id,
      type: 'out',
      qty: -Math.abs(l.qty),
      unit_price: l.unit_price,
      payment_method: sale.payment_method,
      note: `Counter sale ${sale.id.slice(0, 8)}`,
      occurred_on: today,
    }))
  )
  return true
}
