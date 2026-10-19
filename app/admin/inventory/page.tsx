'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'

type Item = {
  id: string; name: string; unit_cost: string | null; sale_price: string | null
  low_stock_threshold: number; stock: number
}
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
  const [tab, setTab] = useState<'stock' | 'in' | 'out' | 'report'>('stock')
  const [items, setItems] = useState<Item[]>([])
  const [moves, setMoves] = useState<Move[]>([])
  const [month, setMonth] = useState(todayStr().slice(0, 7))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  // item form
  const [editId, setEditId] = useState<string | null>(null)
  const [iName, setIName] = useState('')
  const [iCost, setICost] = useState('')
  const [iPrice, setIPrice] = useState('')
  const [iLow, setILow] = useState('')
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
    setItems(d.items); setMoves(d.movements)
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
  const lowItems = items.filter(i => i.low_stock_threshold > 0 && i.stock <= i.low_stock_threshold)

  const openItemForm = (i?: Item) => {
    setEditId(i?.id ?? null)
    setIName(i?.name ?? ''); setICost(i?.unit_cost ?? ''); setIPrice(i?.sale_price ?? '')
    setILow(i ? String(i.low_stock_threshold) : '')
    setShowItemForm(true)
  }
  const saveItem = async () => {
    const ok = await post({
      action: editId ? 'update_item' : 'add_item', id: editId,
      name: iName, unit_cost: iCost, sale_price: iPrice, low_stock_threshold: iLow,
    })
    if (ok) setShowItemForm(false)
  }

  const pickItem = (id: string, type: 'in' | 'out') => {
    setMItem(id)
    const it = itemById[id]
    if (it) setMPrice((type === 'in' ? it.unit_cost : it.sale_price) ?? '')
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
    const byItem: Record<string, { name: string; inQty: number; inCost: number; outQty: number; outRev: number }> = {}
    for (const m of moves) {
      const it = itemById[m.item_id]
      const row = (byItem[m.item_id] ??= { name: it?.name ?? '?', inQty: 0, inCost: 0, outQty: 0, outRev: 0 })
      const p = parseFloat(m.unit_price ?? '') || 0
      if (m.type === 'in') { row.inQty += m.qty; row.inCost += p * m.qty; cost += p * m.qty }
      if (m.type === 'out') {
        const q = -m.qty
        row.outQty += q; row.outRev += p * q; sales += p * q
        cogs += (parseFloat(it?.unit_cost ?? '') || 0) * q
      }
    }
    return { cost, sales, profit: sales - cogs, rows: Object.values(byItem) }
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
        ? <input className={inp} placeholder="供應商 Supplier（選填）" value={mWho} onChange={e => setMWho(e.target.value)} />
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
          {([['stock', '庫存 Stock'], ['in', '進貨 In'], ['out', '出貨 Sale'], ['report', '月報表 Report']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold ${tab === k ? 'bg-white shadow text-sky-700' : 'text-gray-500'}`}>{l}</button>
          ))}
        </div>

        {tab === 'stock' && (
          <>
            <button onClick={() => openItemForm()} className={`${btn} bg-sky-600 text-white mb-3`}>＋ 新增商品 Add item</button>
            {showItemForm && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid gap-3 sm:grid-cols-2">
                <input className={`${inp} sm:col-span-2`} placeholder="商品名稱 Name" value={iName} onChange={e => setIName(e.target.value)} />
                <input className={inp} type="number" step="0.01" placeholder="進價 Cost" value={iCost} onChange={e => setICost(e.target.value)} />
                <input className={inp} type="number" step="0.01" placeholder="售價 Price" value={iPrice} onChange={e => setIPrice(e.target.value)} />
                <input className={`${inp} sm:col-span-2`} type="number" placeholder="低庫存提醒數量 Low-stock alert at (0 = off)" value={iLow} onChange={e => setILow(e.target.value)} />
                <div className="sm:col-span-2 flex gap-2">
                  <button disabled={busy || !iName.trim()} onClick={saveItem} className={`${btn} bg-sky-600 text-white flex-1`}>儲存 Save</button>
                  <button onClick={() => setShowItemForm(false)} className={`${btn} bg-gray-100 text-gray-600`}>取消</button>
                </div>
              </div>
            )}
            <div className="bg-white rounded-xl border border-gray-200 divide-y">
              {items.map(i => (
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
              {items.length === 0 && <p className="px-4 py-8 text-sm text-gray-400 text-center">還沒有商品，先新增一個 Add your first item</p>}
            </div>
          </>
        )}

        {tab === 'in' && <>{MoveForm({ type: 'in' })}{MoveList({ type: 'in' })}</>}
        {tab === 'out' && <>{MoveForm({ type: 'out' })}{MoveList({ type: 'out' })}</>}

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
