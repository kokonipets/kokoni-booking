'use client'
import { useCallback, useEffect, useState } from 'react'
import { readAuthRaw } from '@/lib/authStorage'
import ZelleIcon from '@/components/ZelleIcon'
import VenmoIcon from '@/components/VenmoIcon'

type Totals = Record<string, { amount: number; tips: number; total: number; count: number; extraTips: number }>
type SysItem = { id: string; pet: string; client: string; total: number; at: string | null }
type SqItem = { id: string; at: string; total: number; ref: string | null; gross?: number; refunded?: number }
type VLine = { id: string; method: string; pet: string; client: string; total: number; at: string | null; tipOnly: boolean; verified: boolean }
type RLine = { id: string; time: string | null; pet: string; client: string; service: string | null; groomer: string | null; method: string | null; amount: number; tip: number; tipMethod: string | null; at: string | null }
type ULine = { id: string; time: string | null; pet: string; client: string; service: string | null; groomer: string | null; status: string }
type Result = {
  date: string
  report: RLine[]
  unpaid: ULine[]
  totals: Totals
  verifyLines: { zelle: VLine[]; venmo: VLine[] }
  square: { configured: boolean; error: string | null; total: number; count: number }
  cardMatch: null | {
    matched: { squares: SqItem[]; items: SysItem[]; how: string }[]
    differs: { squares: SqItem[]; items: SysItem[] }[]
    squareOnly: SqItem[]
    systemOnly: SysItem[]
    refunded?: SqItem[]
  }
  closing: null | { signed_by: string; signed_at: string; cash_counted: string | null; zelle_verified: boolean; venmo_verified: boolean; notes: string | null }
  changedSinceClose: boolean
}

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`
const shiftDay = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const laToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
const laTime = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' }) : ''

// Daily close (每日核帳): compare each day's recorded payments with what actually came in,
// then sign off. Card is compared with Square automatically; cash is counted by hand;
// Zelle / Venmo are ticked once checked against the app or bank.
type MonthDay = { count: number; revenue: number; tips: number; signed: boolean; changed: boolean; signed_by: string | null; signed_at: string | null; has_note: boolean }

// Month overview: a calendar showing which days are signed off, which still need it.
function MonthView({ onPick }: { onPick: (date: string) => void }) {
  const [month, setMonth] = useState(laToday().slice(0, 7))
  const [days, setDays] = useState<Record<string, MonthDay>>({})
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let off = false
    setLoading(true); setErr('')
    fetch(`/api/admin/daily-close?month=${month}`).then(r => r.json()).then(d => {
      if (off) return
      if (d.error) setErr(d.error); else setDays(d.days)
    }).catch(e => !off && setErr(e.message)).finally(() => !off && setLoading(false))
    return () => { off = true }
  }, [month])

  const [y, mo] = month.split('-').map(Number)
  const nDays = new Date(y, mo, 0).getDate()
  const lead = new Date(y, mo - 1, 1).getDay()
  const today = laToday()
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: nDays }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)]
  const shiftMonth = (n: number) => { const d = new Date(y, mo - 1 + n, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }
  const entries = Object.entries(days)
  const needing = entries.filter(([d, v]) => v.count > 0 && d < today)
  const signedN = needing.filter(([, v]) => v.signed && !v.changed).length
  const todo = needing.filter(([, v]) => !v.signed || v.changed).map(([d]) => d).sort()

  return (
    <div className="space-y-4">
      {err && <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">{err}</div>}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => shiftMonth(-1)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">‹</button>
        <input type="month" value={month} max={today.slice(0, 7)} onChange={e => e.target.value && setMonth(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        <button disabled={month >= today.slice(0, 7)} onClick={() => shiftMonth(1)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm disabled:opacity-40">›</button>
        <span className="text-sm text-gray-600 ml-2">已核帳 <b className="text-emerald-600">{signedN}</b> / {needing.length} 天{loading && '…'}</span>
      </div>
      {todo.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-sm">
          <p className="font-semibold text-rose-700 mb-1">還沒核帳（或核帳後有變動）的日子（{todo.length}）</p>
          <div className="flex flex-wrap gap-2">
            {todo.map(d => <button key={d} onClick={() => onPick(d)} className="px-2.5 py-1 rounded-full bg-white border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-100">{d.slice(5).replace('-', '/')}</button>)}
          </div>
        </div>
      )}
      <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-gray-400">
        {['日', '一', '二', '三', '四', '五', '六'].map(w => <div key={w}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((d, i) => {
          if (!d) return <div key={'e' + i} />
          const v = days[d]
          const has = !!v && v.count > 0
          const isFuture = d > today
          let cls = 'bg-gray-50 text-gray-300 border-gray-100'
          let tag = ''
          if (has && v.signed && !v.changed) { cls = 'bg-emerald-50 text-emerald-800 border-emerald-200'; tag = '✓ 已核帳' }
          else if (has && v.signed && v.changed) { cls = 'bg-amber-50 text-amber-800 border-amber-300'; tag = '⚠ 有變動' }
          else if (has && d < today) { cls = 'bg-rose-50 text-rose-700 border-rose-200'; tag = '未核帳' }
          else if (has) { cls = 'bg-sky-50 text-sky-700 border-sky-200'; tag = '今天' }
          return (
            <button key={d} disabled={isFuture} onClick={() => onPick(d)}
              className={`rounded-lg border p-1.5 min-h-[72px] text-left flex flex-col justify-between ${cls} ${d === today ? 'ring-2 ring-sky-400' : ''} disabled:opacity-40`}>
              <span className="text-sm font-semibold">{Number(d.slice(8))}</span>
              {has ? <span className="text-[11px] leading-tight">{money(v.revenue + v.tips)}<br />{tag}{v.signed && v.signed_by ? ` · ${v.signed_by}` : ''}</span> : <span className="text-[11px]">&nbsp;</span>}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-gray-400">綠色＝已核帳，紅色＝有收款但還沒核帳，黃色＝核帳後付款有變動，灰色＝沒有收款。點日期進入當天核帳。</p>
    </div>
  )
}

export default function DailyClose({ onOpen }: { onOpen?: (id: string) => void }) {
  const [view, setView] = useState<'day' | 'month'>('day')
  const [pickedDate, setPickedDate] = useState<string | null>(null)
  return (
    <div>
      <div className="flex gap-1 mb-3 bg-gray-100 p-1 rounded-xl w-fit">
        {([['day', '單日 Day'], ['month', '月份總覽 Month']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} className={`px-4 py-1.5 rounded-lg text-sm font-semibold ${view === k ? 'bg-white shadow text-sky-700' : 'text-gray-500'}`}>{l}</button>
        ))}
      </div>
      {view === 'month'
        ? <div className="bg-white rounded-2xl border border-gray-200 p-5"><MonthView onPick={d => { setPickedDate(d); setView('day') }} /></div>
        : <DayClose key={pickedDate ?? 'today'} onOpen={onOpen} initialDate={pickedDate ?? undefined} />}
    </div>
  )
}

function DayClose({ onOpen, initialDate }: { onOpen?: (id: string) => void; initialDate?: string }) {
  const [date, setDate] = useState(initialDate ?? laToday())
  const [data, setData] = useState<Result | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [cash, setCash] = useState('')
  const [notes, setNotes] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    try {
      const u = JSON.parse(readAuthRaw('admin') || 'null')
      setName(localStorage.getItem('daily_close_name') || u?.name || '')
    } catch { /* ignore */ }
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const r = await fetch(`/api/admin/daily-close?date=${date}`)
      const d = await r.json()
      if (d.error) { setErr(d.error); setData(null) }
      else {
        setData(d)
        setCash(d.closing?.cash_counted ?? '')
        setNotes(d.closing?.notes ?? '')
      }
    } catch (e) { setErr((e as Error).message) }
    setLoading(false)
  }, [date])
  useEffect(() => { load() }, [load])

  const t = data?.totals
  const cardDiff = data && data.square.configured && !data.square.error && t ? Math.round((data.square.total - t.card.total) * 100) / 100 : null
  const cashDiff = t && cash !== '' ? Math.round((parseFloat(cash) - t.cash.total) * 100) / 100 : null
  const hasDiff = (cardDiff != null && Math.abs(cardDiff) > 0.005) || (cashDiff != null && Math.abs(cashDiff) > 0.005)

  const tick = async (l: VLine, checked: boolean) => {
    // optimistic update, then persist
    setData(d => d ? { ...d, verifyLines: { ...d.verifyLines, [l.method]: (d.verifyLines as Record<string, VLine[]>)[l.method].map(x => x.id === l.id && x.tipOnly === l.tipOnly ? { ...x, verified: checked } : x) } as Result['verifyLines'] } : d)
    const r = await fetch('/api/admin/daily-close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'verify', appointment_id: l.id, method: l.method, verified: checked, by: name }) })
    const d = await r.json()
    if (d.error) { setErr(d.error + (/payment_verifications/.test(d.error) ? '（請先在 Supabase 執行 20261019b_payment_verifications.sql）' : '')); load() }
  }
  const tickAll = async (k: 'zelle' | 'venmo', checked: boolean) => {
    for (const l of data?.verifyLines[k] ?? []) if (l.verified !== checked) await tick(l, checked)
  }

  const sign = async () => {
    if (!name.trim()) { setErr('請輸入核對人姓名 Enter your name'); return }
    if (hasDiff && !notes.trim()) { setErr('金額有差異，請在備註說明原因 Add a note explaining the difference'); return }
    if (t && t.cash.total > 0 && cash === '') { setErr('請輸入現金點鈔金額 Enter the cash you counted'); return }
    setSaving(true); setErr('')
    localStorage.setItem('daily_close_name', name.trim())
    const r = await fetch('/api/admin/daily-close', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, signed_by: name.trim(), cash_counted: cash, notes }),
    })
    const d = await r.json()
    setSaving(false)
    if (d.error) setErr(d.error); else load()
  }

  const badge = (ok: boolean | null, okText = '相符', badText = '有差異') =>
    ok === null ? <span className="text-xs text-gray-300">—</span>
      : ok ? <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">✓ {okText}</span>
           : <span className="text-xs font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">✗ {badText}</span>

  const m = data?.cardMatch
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-gray-800">✅ 每日核帳 Daily close</h3>
          <p className="text-xs text-gray-400 mt-0.5">核對當天收到的錢，跟系統記錄是否一樣</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(shiftDay(date, -1))} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" aria-label="前一天">‹</button>
          <input type="date" value={date} max={laToday()} onChange={e => e.target.value && setDate(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          <button disabled={date >= laToday()} onClick={() => setDate(shiftDay(date, 1))} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm disabled:opacity-40" aria-label="後一天">›</button>
          <button onClick={() => setDate(laToday())} className="text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5">今天</button>
          <button onClick={load} className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5">⟳</button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {err && <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">{err}{/daily_closings/.test(err) && '（請先在 Supabase 執行 20261019_add_daily_closings.sql）'}</div>}
        {loading && !data && <p className="text-sm text-gray-400">載入中…</p>}

        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['營業額 Revenue', money(data.report.reduce((t, r) => t + r.amount, 0)), 'bg-sky-50 text-sky-700'],
              ['小費 Tips', money(data.report.reduce((t, r) => t + r.tip, 0)), 'bg-emerald-50 text-emerald-700'],
              ['已付款 Paid', String(data.report.length), 'bg-violet-50 text-violet-700'],
              ['未付款 Unpaid', String(data.unpaid.length), data.unpaid.length > 0 ? 'bg-rose-50 text-rose-700' : 'bg-gray-50 text-gray-500'],
            ].map(([l, v, c]) => (
              <div key={l} className={`rounded-xl p-3 ${c}`}><p className="text-xs opacity-80">{l}</p><p className="text-xl font-bold">{v}</p></div>
            ))}
          </div>
        )}

        {data?.closing && (
          <div className={`p-3 rounded-xl text-sm ${data.changedSinceClose ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
            {data.changedSinceClose
              ? <>⚠️ 簽核後這天的付款記錄有變動，請重新核對並更新簽核。（上次由 {data.closing.signed_by} 簽核）</>
              : <>✓ 已核帳 · {data.closing.signed_by} · {new Date(data.closing.signed_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</>}
          </div>
        )}

        {data && t && (
          <div className="divide-y divide-gray-100 text-sm">
            <div className="grid grid-cols-12 gap-2 pb-2 text-xs text-gray-400">
              <span className="col-span-2">付款方式</span><span className="col-span-3 text-right">系統記錄</span>
              <span className="col-span-4 text-right">實際收到</span><span className="col-span-3 text-right">結果</span>
            </div>

            <div className="grid grid-cols-12 gap-2 py-3 items-center">
              <span className="col-span-2 font-semibold">💳 Card</span>
              <span className="col-span-3 text-right">{money(t.card.total)}<span className="block text-xs text-gray-400">{t.card.count} 筆（含小費）</span></span>
              <span className="col-span-4 text-right">
                {data.square.configured && !data.square.error ? <>{money(data.square.total)}<span className="block text-xs text-gray-400">Square {data.square.count} 筆</span></> : <span className="text-xs text-amber-600">{data.square.error || 'Square 未設定'}</span>}
              </span>
              <span className="col-span-3 text-right">{badge(cardDiff === null ? null : Math.abs(cardDiff) < 0.005)}{cardDiff !== null && Math.abs(cardDiff) >= 0.005 && <span className="block text-xs text-rose-500">{money(cardDiff)}</span>}</span>
            </div>

            <div className="grid grid-cols-12 gap-2 py-3 items-center">
              <span className="col-span-2 font-semibold">💵 Cash</span>
              <span className="col-span-3 text-right">{money(t.cash.total)}<span className="block text-xs text-gray-400">{t.cash.count} 筆{t.cash.extraTips > 0 && ` · 含刷卡單的現金小費 ${money(t.cash.extraTips)}`}</span></span>
              <span className="col-span-4 text-right">
                <input type="number" step="0.01" placeholder="點鈔金額" value={cash} onChange={e => setCash(e.target.value)} className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-right" />
              </span>
              <span className="col-span-3 text-right">{badge(cashDiff === null ? null : Math.abs(cashDiff) < 0.005)}{cashDiff !== null && Math.abs(cashDiff) >= 0.005 && <span className="block text-xs text-rose-500">{money(cashDiff)}</span>}</span>
            </div>

            {(['zelle', 'venmo'] as const).map(k => {
              const ls = data.verifyLines[k]
              const done = ls.filter(l => l.verified).length
              return (
                <div key={k} className="py-3">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <span className="col-span-2 font-semibold">{k === 'zelle' ? <><ZelleIcon /> Zelle</> : <><VenmoIcon /> Venmo</>}</span>
                    <span className="col-span-3 text-right">{money(t[k].total)}<span className="block text-xs text-gray-400">{t[k].count} 筆{t[k].extraTips > 0 && ` · 含小費 ${money(t[k].extraTips)}`}</span></span>
                    <span className="col-span-4 text-right text-xs text-gray-500">
                      {ls.length > 0 && <>已核對 {done}/{ls.length}　<button onClick={() => tickAll(k, done !== ls.length)} className="text-sky-600 underline">{done === ls.length ? '全部取消' : '全部勾選'}</button></>}
                    </span>
                    <span className="col-span-3 text-right">{ls.length === 0 ? badge(null) : badge(done === ls.length, '已核對', `未核對 ${ls.length - done}`)}</span>
                  </div>
                  {ls.length > 0 && (
                    <div className="mt-2 ml-2 rounded-lg bg-gray-50 divide-y divide-gray-100">
                      {ls.map(l => (
                        <label key={l.id + (l.tipOnly ? 't' : '')} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-100/60">
                          <input type="checkbox" checked={l.verified} onChange={e => tick(l, e.target.checked)} />
                          <span className="text-xs text-gray-400 w-16">{laTime(l.at)}</span>
                          <span className="flex-1 text-sm">{l.pet}<span className="text-gray-400"> · {l.client}</span>{l.tipOnly && <span className="ml-2 text-xs text-gray-400">（小費）</span>}</span>
                          <span className={`text-sm font-semibold ${l.verified ? 'text-emerald-600' : 'text-gray-700'}`}>{money(l.total)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {m && (m.systemOnly.length > 0 || m.squareOnly.length > 0 || m.differs.length > 0) && (
          <div className="space-y-3">
            {m.systemOnly.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3">
                <p className="text-sm font-semibold text-rose-700 mb-1">系統記刷卡、Square 沒有收到（{m.systemOnly.length}）</p>
                {m.systemOnly.map(s => (
                  <div key={s.id} className="flex items-center gap-3 text-sm py-1">
                    <span className="text-gray-400 w-16">{laTime(s.at)}</span>
                    <span className="flex-1">{s.pet} · {s.client}</span><span>{money(s.total)}</span>
                    {onOpen && !s.id.startsWith('r:') && <button onClick={() => onOpen(s.id)} className="text-xs text-sky-600 underline">打開</button>}
                  </div>
                ))}
                <p className="text-xs text-gray-500 mt-1">請確認是不是客人其實付了現金或 Zelle，或根本沒刷成功。</p>
              </div>
            )}
            {m.squareOnly.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                <p className="text-sm font-semibold text-amber-700 mb-1">Square 有收到、系統沒有記錄（{m.squareOnly.length}）</p>
                {m.squareOnly.map(s => (
                  <div key={s.id} className="flex items-center gap-3 text-sm py-1">
                    <span className="text-gray-400 w-16">{laTime(s.at)}</span><span className="flex-1">Square 付款 {s.id.slice(0, 8)}</span><span>{money(s.total)}</span>
                  </div>
                ))}
                <p className="text-xs text-gray-500 mt-1">錢收了但預約還沒標成已付款，或是不是來自預約的收款。</p>
              </div>
            )}
            {m.differs.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                <p className="text-sm font-semibold text-amber-700 mb-1">金額不一致（{m.differs.length}）</p>
                {m.differs.map(d => {
                  const sysSum = d.items.reduce((s, i) => s + i.total, 0)
                  const sqSum = d.squares.reduce((s, p) => s + p.total, 0)
                  return (
                    <div key={d.squares.map(p => p.id).join('')} className="flex items-center gap-3 text-sm py-1">
                      <span className="flex-1">{d.items.map(i => `${i.pet}`).join(' + ')}<span className="text-gray-400"> · {d.items[0]?.client}</span></span>
                      <span className="text-gray-500">系統 {money(sysSum)}</span><span>Square {money(sqSum)}</span>
                      <span className="text-rose-500 w-16 text-right">{money(sqSum - sysSum)}</span>
                    </div>
                  )
                })}
                <p className="text-xs text-gray-500 mt-1">同一位客人的付款金額跟系統不同，常見原因是小費沒刷在卡上（改付現金等）。</p>
              </div>
            )}
          </div>
        )}
        {m && (m.refunded?.length ?? 0) > 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm font-semibold text-gray-600 mb-1">已全額退款的刷卡（{m.refunded!.length}）— 淨額 $0，不影響核帳</p>
            {m.refunded!.map(r => (
              <div key={r.id} className="flex items-center gap-3 text-sm py-1 text-gray-600">
                <span className="text-gray-400 w-16">{laTime(r.at)}</span><span className="flex-1">Square 付款 {r.id.slice(0, 8)}</span>
                <span>刷了 {money(r.gross ?? 0)}，退回 {money(r.refunded ?? 0)}</span>
              </div>
            ))}
            <p className="text-xs text-gray-400 mt-1">常見原因：金額刷錯或重複刷，退款後重新刷一次。</p>
          </div>
        )}
        {m && m.matched.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-500">✓ 已配對 {m.matched.length} 筆刷卡</summary>
            <div className="mt-1 divide-y divide-gray-50">
              {m.matched.map(x => (
                <div key={x.squares.map(p => p.id).join('')} className="flex items-center gap-3 py-1 text-xs text-gray-600">
                  <span className="text-gray-400 w-16">{laTime(x.squares[0].at)}</span>
                  <span className="flex-1">{x.items.map(i => i.pet).join(' + ')}</span>
                  <span className="text-gray-300">{x.how}</span><span>{money(x.squares.reduce((t, p) => t + p.total, 0))}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        {data && (
          <div className="border-t border-gray-100 pt-4 grid gap-3 sm:grid-cols-2">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="核對人 Your name" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="備註 Notes（有差異時必填）" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <button onClick={sign} disabled={saving} className="sm:col-span-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg py-2.5 text-sm disabled:opacity-50">
              {saving ? '…' : data.closing ? '更新簽核 Update sign-off' : '簽核 Sign off this day'}
            </button>
          </div>
        )}
        {data && <DayDetail data={data} />}
      </div>
    </div>
  )
}

const svcLabel = (s: string | null) => (s ?? '').replace(/_/g, ' ')
const methodName: Record<string, string> = { card: '刷卡', cash: '現金', zelle: 'Zelle', venmo: 'Venmo' }
const MethodTag = ({ m }: { m: string | null }) => m === 'zelle' ? <ZelleIcon /> : m === 'venmo' ? <VenmoIcon /> : <>{({ card: '💳', cash: '💵' } as Record<string, string>)[m ?? ''] ?? ''}</>

// The shop's report for the selected day: per-groomer totals, every paid visit, and unpaid visits.
function DayDetail({ data }: { data: Result }) {
  const by = new Map<string, { revenue: number; tips: number; n: number }>()
  for (const r of data.report) {
    const k = r.groomer || '未指定'
    const g = by.get(k) ?? { revenue: 0, tips: 0, n: 0 }
    g.revenue += r.amount; g.tips += r.tip; g.n++
    by.set(k, g)
  }
  const sorted = [...data.report].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''))
  return (
    <div className="space-y-4 border-t border-gray-100 pt-4">
      {data.unpaid.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3">
          <p className="text-sm font-semibold text-rose-700 mb-1">當天還沒付款的預約（{data.unpaid.length}）</p>
          {data.unpaid.map(u => (
            <div key={u.id} className="flex items-center gap-3 text-sm py-1">
              <span className="text-gray-400 w-20">{u.time}</span>
              <span className="flex-1">{u.pet} · {u.client}<span className="text-gray-400"> · {svcLabel(u.service)}</span></span>
              <span className="text-xs text-gray-500">{u.groomer || ''}</span>
            </div>
          ))}
        </div>
      )}
      {(() => {
        const odd = data.report.filter(r => r.tip > 0 && r.tipMethod && r.tipMethod !== r.method)
        if (!odd.length) return null
        const byM: Record<string, number> = {}
        for (const r of odd) byM[r.tipMethod!] = (byM[r.tipMethod!] ?? 0) + r.tip
        return (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm">
            <p className="font-semibold text-amber-800 mb-1">小費用不同方式付（{odd.length} 筆）</p>
            <p className="text-xs text-amber-700 mb-1">{Object.entries(byM).map(([m, v]) => `${methodName[m] ?? m} ${money(v)}`).join('　')}　— 這些小費不在刷卡金額裡，核對時要算在對應的付款方式上。</p>
            {odd.map(r => (
              <div key={r.id} className="flex items-center gap-3 py-0.5">
                <span className="flex-1">{r.pet}<span className="text-gray-500"> · {r.client}</span><span className="text-gray-400">（服務 {methodName[r.method ?? ''] ?? r.method}）</span></span>
                <span className="font-semibold">小費 {money(r.tip)} <MethodTag m={r.tipMethod} /> {methodName[r.tipMethod!] ?? r.tipMethod}</span>
              </div>
            ))}
          </div>
        )
      })()}
      {by.size > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-1">各美容師 By groomer</p>
          <div className="divide-y divide-gray-50 text-sm">
            {[...by.entries()].map(([k, g]) => (
              <div key={k} className="flex items-center gap-3 py-1.5">
                <span className="flex-1 font-medium">{k}</span><span className="text-gray-400 text-xs">{g.n} 筆</span>
                <span className="w-24 text-right">{money(g.revenue)}</span><span className="w-24 text-right text-emerald-600">+{money(g.tips)} tip</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-1">當天所有付款 All payments（{sorted.length}）</p>
        <div className="divide-y divide-gray-50 text-sm">
          {sorted.map(r => (
            <div key={r.id} className={`flex items-center gap-3 py-1.5 ${r.tip > 0 && r.tipMethod && r.tipMethod !== r.method ? 'bg-amber-50 -mx-2 px-2 rounded' : ''}`}>
              <span className="text-gray-400 w-16 text-xs">{laTime(r.at)}</span>
              <span className="flex-1 min-w-0 truncate">{r.pet}<span className="text-gray-400"> · {r.client} · {svcLabel(r.service)}</span></span>
              <span className="text-xs text-gray-400 w-20 truncate">{r.groomer || ''}</span>
              <span className="w-6 text-center"><MethodTag m={r.method} /></span>
              <span className="w-20 text-right">{money(r.amount)}</span>
              <span className="w-40 text-right text-xs text-emerald-600">
                {r.tip > 0 ? (r.tipMethod && r.tipMethod !== r.method
                  ? <span className="font-semibold text-amber-700">小費 +{money(r.tip)} <MethodTag m={r.tipMethod} /> {methodName[r.tipMethod] ?? r.tipMethod}</span>
                  : <>小費 +{money(r.tip)}</>) : <span className="text-gray-400">小費 $0.00</span>}
              </span>
            </div>
          ))}
          {sorted.length === 0 && <p className="py-3 text-gray-400 text-center">這天沒有付款記錄</p>}
        </div>
      </div>
    </div>
  )
}
