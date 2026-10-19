'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'

type Item = {
  id: string; name: string; unit_cost: string | null; sale_price: string | null
  low_stock_threshold: number; stock: number; vendor: string | null
  consignment: boolean; in_qty: number; out_qty: number
}
type Payment = { id: string; vendor: string; amount: string; paid_on: string; method: string | null; note: string | null }
type Move = {
  id: string; item_id: string; type: 'in' | 'out' | 'adjust'; qty: number
  unit_price: string | null; payment_method: string | null; supplier: string | null
  note: string | null; occurred_on: string
}

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const money = (n: number) => `$${n.toFixed(2)}`
const PAY = ['cash', 'card', 'venmo', 'zelle', 'other']

export default function InventoryPage() {
  const [tab, setTab] = useState<'stock' | 'sell' | 'in' | 'out' | 'pay' | 'report'>('stock')
  const [items, setItems] = useState<Item[]>([])
  const [moves, setMoves] = useState<Move[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  // counter sale (店販收銀)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [sellErr, setSellErr] = useState('')
  const [sellDone, setSellDone] = useState('')
  const [cardSaleId, setCardSaleId] = useState<string | null>(null)
  const [iConsign, setIConsign] = useState(false)
  const [pVendor, setPVendor] = useState<string | null>(null)
  const [pAmt, setPAmt] = useState('')
  const [pMethod, setPMethod] = useState('')
  const [pNote, setPNote] = useState('')
  const [pDate, setPDate] = useState(todayStr())
  const [month, setMonth] = useState(todayStr().slice(0, 7))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  // item form
  const [editId, setEditId] = useState<string | null>(null)
  const [iName, setIName] = useState('')
  const [iCost, setICost] = useState('')
  const [iPrice, setIPrice] = useState('')
  const [iLow, setILow] = useState('')
  const [iVendor, setIVendor] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [showItemForm, setShowItemForm] = useState(false)

  // movement form
  const [mItem, setMItem] = useState('')
  const [mQty, setMQty] = useState('')
  const [mPrice, setMPrice] = useState('')
  const [mWho, setMWho] = useState('')      // supplier (in) / payment method (out)
  const [mNote, setMNote] = useState('')
  const [mDate, setMDate] = useState(todayStr())

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/inventory?month=${month}`)
    const d = await r.json()
    if (d.error) { setErr(d.error); return }
    setErr('')
    setItems(d.items); setMoves(d.movements); setPayments(d.payments ?? [])
  }, [month])
  useEffect(() => { load() }, [load])

  const post = async (body: object) => {
    setBusy(true)
    const r = await fetch('/api/admin/inventory', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const d = await r.json()
    setBusy(false)
    if (d.error) { setErr(d.error); return false }
    setErr('')
    await load()
    return true
  }

  const itemById = useMemo(() => Object.fromEntries(items.map(i => [i.id, i])), [items])
  // Value of what's on hand right now (stock × default cost / sale price).
  const stockTotals = items.filter(i => !vendorFilter || i.vendor === vendorFilter).reduce((t, i) => {
    const q = Math.max(0, i.stock)
    return {
      units: t.units + q,
      cost: t.cost + q * (parseFloat(i.unit_cost ?? '') || 0),
      retail: t.retail + q * (parseFloat(i.sale_price ?? '') || 0),
    }
  }, { units: 0, cost: 0, retail: 0 })
  const vendors = useMemo(() => Array.from(new Set(items.map(i => i.vendor).filter(Boolean) as string[])).sort(), [items])
  // Stock list grouped by vendor (each vendor gets its own highlighted section).
  const vendorGroups = useMemo(() => {
    const map = new Map<string | null, Item[]>()
    for (const i of items) {
      if (vendorFilter && i.vendor !== vendorFilter) continue
      const k = i.vendor || null
      map.set(k, [...(map.get(k) ?? []), i])
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)))
      .map(([vendor, its]) => ({
        vendor, items: its,
        units: its.reduce((t, i) => t + Math.max(0, i.stock), 0),
        cost: its.reduce((t, i) => t + Math.max(0, i.stock) * (parseFloat(i.unit_cost ?? '') || 0), 0),
      }))
  }, [items, vendorFilter])
  // Accounts payable per vendor: consignment items owe cost x units SOLD; normal items owe cost x units PURCHASED.
  const payables = useMemo(() => {
    const m = new Map<string, { vendor: string; owed: number; paid: number; payments: Payment[] }>()
    const get = (v: string) => { if (!m.has(v)) m.set(v, { vendor: v, owed: 0, paid: 0, payments: [] }); return m.get(v)! }
    for (const i of items) {
      if (!i.vendor) continue
      get(i.vendor).owed += (parseFloat(i.unit_cost ?? '') || 0) * (i.consignment ? i.out_qty : i.in_qty)
    }
    for (const p of payments) { const g = get(p.vendor); g.paid += parseFloat(p.amount) || 0; g.payments.push(p) }
    return Array.from(m.values()).sort((a, b) => a.vendor.localeCompare(b.vendor))
  }, [items, payments])
  const cartLines = items.filter(i => (cart[i.id] ?? 0) > 0)
  const cartTotal = cartLines.reduce((t, i) => t + cart[i.id] * (parseFloat(i.sale_price ?? '') || 0), 0)
  const bump = (id: string, d: number) => setCart(c => {
    const n = Math.max(0, (c[id] ?? 0) + d)
    const next = { ...c }
    if (n === 0) delete next[id]; else next[id] = n
    return next
  })
  const finishSale = (msg: string) => { setCart({}); setCardSaleId(null); setSellDone(msg); setSellErr(''); load() }
  const checkoutSale = async (method: 'cash' | 'card' | 'zelle' | 'venmo') => {
    setSellErr(''); setSellDone('')
    setBusy(true)
    const r = await fetch('/api/admin/retail-sale', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', method, lines: cartLines.map(i => ({ item_id: i.id, qty: cart[i.id] })) }),
    })
    const d = await r.json()
    setBusy(false)
    if (d.error) { setSellErr(d.error); return }
    if (d.status === 'paid') finishSale(`已收款 Sale recorded · ${money(d.total)}`)
    else setCardSaleId(d.id)
  }
  // Poll the Terminal sale until Square reports it paid / cancelled.
  useEffect(() => {
    if (!cardSaleId) return
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/admin/retail-sale?id=${cardSaleId}`)
        const d = await r.json()
        if (d.status === 'paid') { clearInterval(t); finishSale('刷卡成功 Card payment received') }
        else if (d.status === 'cancelled') { clearInterval(t); setCardSaleId(null); setSellErr('付款已取消 Payment cancelled') }
      } catch { /* keep polling */ }
    }, 3000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardSaleId])
  const cancelCardSale = async () => {
    if (!cardSaleId) return
    const r = await fetch('/api/admin/retail-sale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', id: cardSaleId }) })
    const d = await r.json()
    if (d.status === 'paid') finishSale('刷卡成功 Card payment received')
    else { setCardSaleId(null); setSellErr('付款已取消 Payment cancelled') }
  }
  const lowItems = items.filter(i => i.low_stock_threshold > 0 && i.stock <= i.low_stock_threshold)

  const openItemForm = (i?: Item) => {
    setEditId(i?.id ?? null)
    setIName(i?.name ?? ''); setICost(i?.unit_cost ?? ''); setIPrice(i?.sale_price ?? '')
    setILow(i ? String(i.low_stock_threshold) : '')
    setIVendor(i?.vendor ?? vendorFilter)
    setIConsign(!!i?.consignment)
    setShowItemForm(true)
  }
  const saveItem = async () => {
    const ok = await post({
      action: editId ? 'update_item' : 'add_item', id: editId,
      name: iName, unit_cost: iCost, sale_price: iPrice, low_stock_threshold: iLow, vendor: iVendor, consignment: iConsign,
    })
    if (ok) setShowItemForm(false)
  }

  const pickItem = (id: string, type: 'in' | 'out') => {
    setMItem(id)
    const it = itemById[id]
    if (it) setMPrice((type === 'in' ? it.unit_cost : it.sale_price) ?? '')
    if (it && type === 'in') setMWho(it.vendor ?? '')
  }
  const saveMove = async (type: 'in' | 'out') => {
    const ok = await post({
      action: 'move', type, item_id: mItem, qty: mQty, unit_price: mPrice,
      supplier: type === 'in' ? mWho : undefined,
      payment_method: type === 'out' ? (mWho || 'cash') : undefined,
      note: mNote, occurred_on: mDate,
    })
    if (ok) { setMQty(''); setMNote('') }
  }

  const report = useMemo(() => {
    let cost = 0, sales = 0, cogs = 0
    const byVendor: Record<string, number> = {}
    const byItem: Record<string, { name: string; inQty: number; inCost: number; outQty: number; outRev: number }> = {}
    for (const m of moves) {
      const it = itemById[m.item_id]
      const row = (byItem[m.item_id] ??= { name: it?.name ?? '?', inQty: 0, inCost: 0, outQty: 0, outRev: 0 })
      const p = parseFloat(m.unit_price ?? '') || 0
      if (m.type === 'in') { row.inQty += m.qty; row.inCost += p * m.qty; cost += p * m.qty
        const v = m.supplier || it?.vendor || '未指定 Unspecified'; byVendor[v] = (byVendor[v] ?? 0) + p * m.qty }
      if (m.type === 'out') {
        const q = -m.qty
        row.outQty += q; row.outRev += p * q; sales += p * q
        cogs += (parseFloat(it?.unit_cost ?? '') || 0) * q
      }
    }
    return { cost, sales, profit: sales - cogs, rows: Object.values(byItem), vendorRows: Object.entries(byVendor) }
  }, [moves, itemById])

  const typeLabel = { in: '進貨 In', out: '出貨 Sale', adjust: '調整 Adjust' }
  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm w-full'
  const btn = 'px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50'

  const MoveForm = ({ type }: { type: 'in' | 'out' }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid gap-3 sm:grid-cols-2">
      <select className={inp} value={mItem} onChange={e => pickItem(e.target.value, type)}>
        <option value="">商品 Item…</option>
        {items.map(i => <option key={i.id} value={i.id}>{i.name}（庫存 {i.stock}）</option>)}
      </select>
      <input className={inp} type="date" value={mDate} onChange={e => setMDate(e.target.value)} />
      <input className={inp} type="number" inputMode="numeric" placeholder="數量 Qty" value={mQty} onChange={e => setMQty(e.target.value)} />
      <input className={inp} type="number" inputMode="decimal" step="0.01"
        placeholder={type === 'in' ? '進價 / 個 Cost each' : '售價 / 個 Price each'} value={mPrice} onChange={e => setMPrice(e.target.value)} />
      {type === 'in'
        ? <><input className={inp} list="vendor-list" placeholder="廠商 Vendor（選填）" value={mWho} onChange={e => setMWho(e.target.value)} />
            <datalist id="vendor-list">{vendors.map(v => <option key={v} value={v} />)}</datalist></>
        : <select className={inp} value={mWho || 'cash'} onChange={e => setMWho(e.target.value)}>
            {PAY.map(p => <option key={p} value={p}>{p}</option>)}
          </select>}
      <input className={inp} placeholder="備註 Note（選填）" value={mNote} onChange={e => setMNote(e.target.value)} />
      <button disabled={busy || !mItem || !mQty} onClick={() => saveMove(type)}
        className={`${btn} sm:col-span-2 text-white ${type === 'in' ? 'bg-sky-600' : 'bg-emerald-600'}`}>
        {type === 'in' ? '記錄進貨 Add stock in' : '記錄出貨 Record sale'}
      </button>
    </div>
  )

  const MoveList = ({ type }: { type: 'in' | 'out' }) => (
    <div className="bg-white rounded-xl border border-gray-200 divide-y">
      {moves.filter(m => m.type === type).map(m => (
        <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
          <span className="text-gray-400 w-20 shrink-0">{m.occurred_on.slice(5)}</span>
          <span className="flex-1 font-medium">{itemById[m.item_id]?.name ?? '?'} × {Math.abs(m.qty)}
            <span className="text-gray-400 font-normal"> {m.unit_price ? `@ ${money(parseFloat(m.unit_price))}` : ''} {m.supplier || m.payment_method || ''} {m.note ? `· ${m.note}` : ''}</span>
          </span>
          <button className="text-gray-300 hover:text-rose-500 text-xs"
            onClick={() => { if (confirm('刪除這筆？Delete this entry?')) post({ action: 'delete_movement', id: m.id }) }}>✕</button>
        </div>
      ))}
      {moves.filter(m => m.type === type).length === 0 && <p className="px-4 py-6 text-sm text-gray-400 text-center">這個月還沒有紀錄 Nothing this month</p>}
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto p-4">
        <div className="flex items-center gap-3 mb-4">
          <a href="/admin/desk" className="text-sky-600 text-sm">← Admin</a>
          <h1 className="text-xl font-bold flex-1">📦 進出貨 Inventory</h1>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 text-sm" />
        </div>

        {err && <div className="mb-3 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">
          {err}{/inventory_(items|movements)/.test(err) && '（資料表還沒建立：請先在 Supabase SQL Editor 執行 20261019_add_inventory.sql）'}
        </div>}

        {lowItems.length > 0 && (
          <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            ⚠️ 庫存偏低 Low stock：{lowItems.map(i => `${i.name}（${i.stock}）`).join('、')}
          </div>
        )}

        <div className="flex gap-1 mb-4 bg-gray-200 p-1 rounded-xl">
          {([['stock', '庫存 Stock'], ['sell', '收銀 Sell'], ['in', '進貨 In'], ['out', '出貨 Sale'], ['pay', '應付 Payable'], ['report', '月報表 Report']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold ${tab === k ? 'bg-white shadow text-sky-700' : 'text-gray-500'}`}>{l}</button>
          ))}
        </div>

        {tab === 'stock' && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[['庫存件數 Units', String(stockTotals.units)], ['進貨價總額 Cost value', money(stockTotals.cost)], ['售價總額 Retail value', money(stockTotals.retail)]].map(([l, v]) => (
                <div key={l} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
                  <p className="text-xs text-gray-400">{l}</p>
                  <p className="text-lg font-bold">{v}</p>
                </div>
              ))}
            </div>
            {vendors.length > 0 && (
              <select className={`${inp} mb-3`} value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}>
                <option value="">全部廠商 All vendors</option>
                {vendors.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            )}
            <button onClick={() => openItemForm()} className={`${btn} bg-sky-600 text-white mb-3`}>＋ 新增商品 Add item</button>
            {showItemForm && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid gap-3 sm:grid-cols-2">
                <input className={`${inp} sm:col-span-2`} placeholder="商品名稱 Name" value={iName} onChange={e => setIName(e.target.value)} />
                <input className={inp} type="number" step="0.01" placeholder="進價 Cost" value={iCost} onChange={e => setICost(e.target.value)} />
                <input className={inp} type="number" step="0.01" placeholder="售價 Price" value={iPrice} onChange={e => setIPrice(e.target.value)} />
                <input className={`${inp} sm:col-span-2`} list="vendor-list" placeholder="廠商 Vendor（選填）" value={iVendor} onChange={e => setIVendor(e.target.value)} />
                <datalist id="vendor-list">{vendors.map(v => <option key={v} value={v} />)}</datalist>
                <label className="sm:col-span-2 flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={iConsign} onChange={e => setIConsign(e.target.checked)} />
                  寄售商品 Consignment（賣出後才需付款給廠商）
                </label>
                <input className={`${inp} sm:col-span-2`} type="number" placeholder="低庫存提醒數量 Low-stock alert at (0 = off)" value={iLow} onChange={e => setILow(e.target.value)} />
                <div className="sm:col-span-2 flex gap-2">
                  <button disabled={busy || !iName.trim()} onClick={saveItem} className={`${btn} bg-sky-600 text-white flex-1`}>儲存 Save</button>
                  <button onClick={() => setShowItemForm(false)} className={`${btn} bg-gray-100 text-gray-600`}>取消</button>
                </div>
              </div>
            )}
            {vendorGroups.map(g => (
              <div key={g.vendor} className="mb-4">
                <div className="flex items-center gap-3 px-4 py-2.5 bg-sky-700 text-white rounded-t-xl">
                  <span className="flex-1 font-bold text-base">{g.vendor ?? '未指定廠商 No vendor'}</span>
                  <span className="text-xs opacity-90">{g.units} 件 · 進貨價 {money(g.cost)}</span>
                </div>
                <div className="bg-white rounded-b-xl border border-t-0 border-gray-200 divide-y">
                  {g.items.map(i => (
                    <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{i.name}</p>
                        <p className="text-xs text-gray-400">進價 {i.unit_cost ? money(parseFloat(i.unit_cost)) : '—'} · 售價 {i.sale_price ? money(parseFloat(i.sale_price)) : '—'}</p>
                      </div>
                      <span className={`text-lg font-bold ${i.low_stock_threshold > 0 && i.stock <= i.low_stock_threshold ? 'text-amber-600' : 'text-gray-800'}`}>{i.stock}</span>
                      <button onClick={() => {
                        const v = prompt(`盤點調整 ${i.name}：目前 ${i.stock}。輸入實際數量`, String(i.stock))
                        if (v === null) return
                        const diff = parseInt(v) - i.stock
                        if (!isNaN(diff) && diff !== 0) post({ action: 'move', type: 'adjust', item_id: i.id, qty: diff, note: '盤點調整', occurred_on: todayStr() })
                      }} className="text-xs text-gray-400 border rounded px-2 py-1">盤點</button>
                      <button onClick={() => openItemForm(i)} className="text-xs text-sky-600">編輯</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {items.length === 0 && <p className="px-4 py-8 text-sm text-gray-400 text-center bg-white rounded-xl border border-gray-200">還沒有商品，先新增一個 Add your first item</p>}
          </>
        )}

        {tab === 'sell' && (
          <>
            {sellDone && <div className="mb-3 p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm">{sellDone}</div>}
            {sellErr && <div className="mb-3 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">{sellErr}</div>}
            {cardSaleId && (
              <div className="mb-4 p-4 rounded-xl bg-sky-50 border border-sky-200 text-center">
                <p className="font-bold text-sky-800">請客人在刷卡機上刷卡 Waiting for card on the Terminal…</p>
                <p className="text-sm text-sky-700 mt-1">{money(cartTotal)}</p>
                <button onClick={cancelCardSale} className="mt-3 text-sm text-gray-500 underline">取消 Cancel</button>
              </div>
            )}
            <div className="bg-white rounded-xl border border-gray-200 divide-y mb-4">
              {items.filter(i => i.sale_price).map(i => (
                <div key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{i.name}</p>
                    <p className="text-xs text-gray-400">{money(parseFloat(i.sale_price!))}（含稅 tax incl.）· 庫存 {i.stock}</p>
                  </div>
                  <button disabled={!!cardSaleId} onClick={() => bump(i.id, -1)} className="w-8 h-8 rounded-lg border border-gray-300 text-lg leading-none disabled:opacity-40">−</button>
                  <span className="w-6 text-center font-bold">{cart[i.id] ?? 0}</span>
                  <button disabled={!!cardSaleId} onClick={() => bump(i.id, 1)} className="w-8 h-8 rounded-lg border border-gray-300 text-lg leading-none disabled:opacity-40">+</button>
                </div>
              ))}
              {items.filter(i => i.sale_price).length === 0 && <p className="px-4 py-6 text-sm text-gray-400 text-center">還沒有設定售價的商品</p>}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex justify-between text-lg font-bold mb-3"><span>合計 Total</span><span>{money(cartTotal)}</span></div>
              {cartLines.some(i => cart[i.id] > i.stock) && <p className="text-xs text-amber-600 mb-2">⚠️ 有商品數量超過庫存，請確認庫存是否正確</p>}
              <div className="grid grid-cols-2 gap-2">
                <button disabled={busy || !!cardSaleId || cartTotal <= 0} onClick={() => checkoutSale('card')} className={`${btn} bg-sky-600 text-white col-span-2`}>刷卡 Card（Terminal）</button>
                {(['cash', 'zelle', 'venmo'] as const).map(m => (
                  <button key={m} disabled={busy || !!cardSaleId || cartTotal <= 0} onClick={() => checkoutSale(m)}
                    className={`${btn} bg-gray-100 text-gray-700`}>{m === 'cash' ? '現金 Cash' : m === 'zelle' ? 'Zelle' : 'Venmo'}</button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">售價已含稅，不另外加稅。收款成功後自動扣庫存，並記入「出貨」。店販不計入美容師薪資。</p>
            </div>
          </>
        )}

        {tab === 'in' && <>{MoveForm({ type: 'in' })}{MoveList({ type: 'in' })}</>}
        {tab === 'out' && <>{MoveForm({ type: 'out' })}{MoveList({ type: 'out' })}</>}

        {tab === 'pay' && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[['應付總額 Owed', payables.reduce((t, g) => t + g.owed, 0)], ['已付 Paid', payables.reduce((t, g) => t + g.paid, 0)], ['待付餘額 Balance due', payables.reduce((t, g) => t + g.owed - g.paid, 0)]].map(([l, v]) => (
                <div key={l as string} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
                  <p className="text-xs text-gray-400">{l as string}</p>
                  <p className="text-lg font-bold">{money(v as number)}</p>
                </div>
              ))}
            </div>
            {payables.length === 0 && <p className="text-sm text-gray-400 text-center py-8 bg-white rounded-xl border border-gray-200">商品還沒有設定廠商 Set a vendor on your items first</p>}
            {payables.map(g => {
              const bal = g.owed - g.paid
              return (
                <div key={g.vendor} className="mb-4">
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-sky-700 text-white rounded-t-xl">
                    <span className="flex-1 font-bold text-base">{g.vendor}</span>
                    <span className="text-xs opacity-90">應付 {money(g.owed)} · 已付 {money(g.paid)}</span>
                  </div>
                  <div className="bg-white rounded-b-xl border border-t-0 border-gray-200 p-4">
                    <p className="text-sm text-gray-500">待付餘額 Balance due</p>
                    <p className={`text-2xl font-bold ${bal > 0.004 ? 'text-rose-600' : 'text-emerald-600'}`}>{money(bal)}</p>
                    {pVendor === g.vendor ? (
                      <div className="grid gap-2 sm:grid-cols-2 mt-3">
                        <input className={inp} type="number" step="0.01" placeholder="付款金額 Amount" value={pAmt} onChange={e => setPAmt(e.target.value)} />
                        <input className={inp} type="date" value={pDate} onChange={e => setPDate(e.target.value)} />
                        <input className={inp} placeholder="付款方式 Method（支票、Zelle…）" value={pMethod} onChange={e => setPMethod(e.target.value)} />
                        <input className={inp} placeholder="備註 Note" value={pNote} onChange={e => setPNote(e.target.value)} />
                        <div className="sm:col-span-2 flex gap-2">
                          <button disabled={busy || !pAmt} onClick={async () => {
                            const ok = await post({ action: 'add_payment', vendor: g.vendor, amount: pAmt, method: pMethod, note: pNote, paid_on: pDate })
                            if (ok) { setPVendor(null); setPAmt(''); setPMethod(''); setPNote('') }
                          }} className={`${btn} bg-emerald-600 text-white flex-1`}>儲存付款 Save payment</button>
                          <button onClick={() => setPVendor(null)} className={`${btn} bg-gray-100 text-gray-600`}>取消</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setPVendor(g.vendor); setPAmt(bal > 0 ? bal.toFixed(2) : ''); setPDate(todayStr()) }}
                        className={`${btn} bg-sky-600 text-white mt-3`}>＋ 記錄付款 Record payment</button>
                    )}
                    {g.payments.length > 0 && (
                      <div className="mt-4 divide-y text-sm border-t">
                        {g.payments.map(p => (
                          <div key={p.id} className="flex items-center gap-3 py-2">
                            <span className="text-gray-400 w-20 shrink-0">{p.paid_on.slice(5)}</span>
                            <span className="flex-1">{money(parseFloat(p.amount))} <span className="text-gray-400">{p.method || ''} {p.note ? `· ${p.note}` : ''}</span></span>
                            <button className="text-gray-300 hover:text-rose-500 text-xs"
                              onClick={() => { if (confirm('刪除這筆付款？Delete this payment?')) post({ action: 'delete_payment', id: p.id }) }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            <p className="text-xs text-gray-400">寄售商品：應付 = 已賣出數量 × 進價；一般商品：應付 = 已進貨數量 × 進價。以商品目前設定的進價計算。</p>
          </>
        )}

        {tab === 'report' && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[['進貨成本 Purchases', report.cost], ['銷售額 Sales', report.sales], ['毛利 Gross profit', report.profit]].map(([l, v]) => (
                <div key={l as string} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
                  <p className="text-xs text-gray-400">{l as string}</p>
                  <p className="text-lg font-bold">{money(v as number)}</p>
                </div>
              ))}
            </div>
            {report.vendorRows.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 divide-y text-sm mb-4">
                <p className="px-4 py-2 text-xs text-gray-400">各廠商進貨額 Purchases by vendor</p>
                {report.vendorRows.map(([v, amt]) => (
                  <div key={v} className="px-4 py-2.5 flex"><span className="flex-1 font-medium">{v}</span><span>{money(amt)}</span></div>
                ))}
              </div>
            )}
            <div className="bg-white rounded-xl border border-gray-200 divide-y text-sm">
              {report.rows.map(r => (
                <div key={r.name} className="px-4 py-2.5 flex gap-3">
                  <span className="flex-1 font-medium">{r.name}</span>
                  <span className="text-gray-500">進 {r.inQty}（{money(r.inCost)}）</span>
                  <span className="text-gray-500">賣 {r.outQty}（{money(r.outRev)}）</span>
                </div>
              ))}
              {report.rows.length === 0 && <p className="px-4 py-6 text-center text-gray-400">這個月沒有紀錄</p>}
            </div>
            <p className="text-xs text-gray-400 mt-3">毛利 = 銷售額 − 賣出數量 × 商品設定的進價（不含店租、人事）。</p>
          </>
        )}
      </div>
    </div>
  )
}
