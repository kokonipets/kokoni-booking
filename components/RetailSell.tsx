'use client'
import { useCallback, useEffect, useState } from 'react'
import { RETAIL_TAX_RATE, withTax } from '@/lib/retail-tax'

type SellItem = { id: string; name: string; sale_price: string | null; stock: number }
const money = (n: number) => `$${n.toFixed(2)}`

// Counter retail sale (店販收銀). Used by Admin → Inventory → Sell and the front-desk Cashier.
// Prices are pre-tax; sales tax (lib/retail-tax) is added at checkout. Card sales are charged on the Square Terminal; the server records the
// sale (and deducts stock) only once Square confirms payment.
export default function RetailSell({ onSold }: { onSold?: () => void }) {
  const [items, setItems] = useState<SellItem[]>([])
  const [cart, setCart] = useState<Record<string, number>>({})
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)
  const [cardSaleId, setCardSaleId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/inventory')
    const d = await r.json()
    if (d.error) { setErr(d.error); return }
    setItems(d.items)
  }, [])
  useEffect(() => { load() }, [load])

  const lines = items.filter(i => (cart[i.id] ?? 0) > 0)
  const { subtotal, tax, total } = withTax(lines.reduce((t, i) => t + cart[i.id] * (parseFloat(i.sale_price ?? '') || 0), 0))
  const bump = (id: string, d: number) => setCart(c => {
    const n = Math.max(0, (c[id] ?? 0) + d)
    const next = { ...c }
    if (n === 0) delete next[id]; else next[id] = n
    return next
  })
  const finish = (msg: string) => { setCart({}); setCardSaleId(null); setDone(msg); setErr(''); load(); onSold?.() }

  const checkout = async (method: 'cash' | 'card' | 'zelle' | 'venmo') => {
    setErr(''); setDone(''); setBusy(true)
    const r = await fetch('/api/admin/retail-sale', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', method, lines: lines.map(i => ({ item_id: i.id, qty: cart[i.id] })) }),
    })
    const d = await r.json()
    setBusy(false)
    if (d.error) { setErr(d.error); return }
    if (d.status === 'paid') finish(`已收款 Sale recorded · ${money(d.total)}`)
    else setCardSaleId(d.id)
  }

  useEffect(() => {
    if (!cardSaleId) return
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/admin/retail-sale?id=${cardSaleId}`)
        const d = await r.json()
        if (d.status === 'paid') { clearInterval(t); finish('刷卡成功 Card payment received') }
        else if (d.status === 'cancelled') { clearInterval(t); setCardSaleId(null); setErr('付款已取消 Payment cancelled') }
      } catch { /* keep polling */ }
    }, 3000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardSaleId])

  const cancelCard = async () => {
    if (!cardSaleId) return
    const r = await fetch('/api/admin/retail-sale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', id: cardSaleId }) })
    const d = await r.json()
    if (d.status === 'paid') finish('刷卡成功 Card payment received')
    else { setCardSaleId(null); setErr('付款已取消 Payment cancelled') }
  }

  const btn = 'px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50'
  const sellable = items.filter(i => i.sale_price)
  return (
    <div>
      {done && <div className="mb-3 p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm">{done}</div>}
      {err && <div className="mb-3 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">{err}</div>}
      {cardSaleId && (
        <div className="mb-4 p-4 rounded-xl bg-sky-50 border border-sky-200 text-center">
          <p className="font-bold text-sky-800">請客人在刷卡機上刷卡 Waiting for card on the Terminal…</p>
          <p className="text-sm text-sky-700 mt-1">{money(total)}</p>
          <button onClick={cancelCard} className="mt-3 text-sm text-gray-500 underline">取消 Cancel</button>
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-200 divide-y mb-4">
        {sellable.map(i => (
          <div key={i.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{i.name}</p>
              <p className="text-xs text-gray-400">{money(parseFloat(i.sale_price!))}（未稅 before tax）· 庫存 {i.stock}</p>
            </div>
            <button disabled={!!cardSaleId} onClick={() => bump(i.id, -1)} className="w-8 h-8 rounded-lg border border-gray-300 text-lg leading-none disabled:opacity-40">−</button>
            <span className="w-6 text-center font-bold">{cart[i.id] ?? 0}</span>
            <button disabled={!!cardSaleId} onClick={() => bump(i.id, 1)} className="w-8 h-8 rounded-lg border border-gray-300 text-lg leading-none disabled:opacity-40">+</button>
          </div>
        ))}
        {sellable.length === 0 && <p className="px-4 py-6 text-sm text-gray-400 text-center">還沒有設定售價的商品</p>}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex justify-between text-sm text-gray-500"><span>小計 Subtotal</span><span>{money(subtotal)}</span></div>
        <div className="flex justify-between text-sm text-gray-500 mb-1"><span>銷售稅 Sales tax（{(RETAIL_TAX_RATE * 100).toFixed(2)}%）</span><span>{money(tax)}</span></div>
        <div className="flex justify-between text-lg font-bold mb-3 border-t pt-2"><span>合計 Total</span><span>{money(total)}</span></div>
        {lines.some(i => cart[i.id] > i.stock) && <p className="text-xs text-amber-600 mb-2">⚠️ 有商品數量超過庫存，請確認庫存是否正確</p>}
        <div className="grid grid-cols-2 gap-2">
          <button disabled={busy || !!cardSaleId || total <= 0} onClick={() => checkout('card')} className={`${btn} bg-sky-600 text-white col-span-2`}>刷卡 Card（Terminal）</button>
          {(['cash', 'zelle', 'venmo'] as const).map(m => (
            <button key={m} disabled={busy || !!cardSaleId || total <= 0} onClick={() => checkout(m)}
              className={`${btn} bg-gray-100 text-gray-700`}>{m === 'cash' ? '現金 Cash' : m === 'zelle' ? 'Zelle' : 'Venmo'}</button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">售價為未稅價，結帳時另加銷售稅。收款成功後自動扣庫存，並記入「出貨」。店販不計入美容師薪資。</p>
      </div>
    </div>
  )
}
