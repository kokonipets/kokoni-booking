'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SERVICE_LABELS: Record<string, string> = {
  bath_brush: 'Bath & Brush', bath_haircut: 'Bath & Haircut', full_groom: 'Full Groom',
  asian_fusion: 'Asian Fusion Style', nail_trim: 'Nail Trim', teeth_brushing: 'Teeth Brushing',
  ear_cleaning: 'Ear Cleaning', deshedding: 'De-shedding', flea_treatment: 'Flea Treatment',
  puppy_first: 'Puppy First Groom', simply_cute: 'Simply Cute',
}

type Appt = {
  id: string
  appointment_time: string
  appointment_date: string
  service: string
  status: string
  grooming_status: string | null
  grooming_status_updated_at: string | null
  grooming_started_at: string | null
  assigned_groomer: string | null
  assigned_bather: string | null
  pets: { id: string; name: string; breed?: string; photo_url: string | null } | null
  clients: { name: string; phone: string } | null
}

const STAGES = [
  { id: 'waiting', label: 'Waiting',           icon: '⏳', bg: 'bg-amber-900/40',  border: 'border-amber-500/50', text: 'text-amber-300',  badge: 'bg-amber-500',  headerBg: 'bg-amber-500/20' },
  { id: 'incare',  label: 'In Good Hands 🐾',  icon: '✂️', bg: 'bg-sky-900/40',    border: 'border-sky-500/50',   text: 'text-sky-300',    badge: 'bg-sky-500',    headerBg: 'bg-sky-500/20' },
  { id: 'ready',   label: 'Ready to Pick Up',  icon: '🔔', bg: 'bg-green-900/40',  border: 'border-green-500/50', text: 'text-green-300',  badge: 'bg-green-500',  headerBg: 'bg-green-500/20' },
  { id: 'done',    label: 'Checked Out',       icon: '🎉', bg: 'bg-pink-900/40',   border: 'border-pink-500/50',  text: 'text-pink-300',   badge: 'bg-pink-500',   headerBg: 'bg-pink-500/20' },
]

function firstName(n: string) { return n?.split(' ')[0] ?? n }

function timeSince(iso: string | null) {
  if (!iso) return null
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default function TVBoard() {
  const [appts, setAppts] = useState<Appt[]>([])
  const [now, setNow] = useState(new Date())
  const [serviceDefs, setServiceDefs] = useState<{id:string;name:string}[]>([])
  const serviceMap: Record<string, string> = {
    ...SERVICE_LABELS,
    ...Object.fromEntries(serviceDefs.filter(s => s.name).map(s => [s.id, s.name])),
  }

  const fetchData = useCallback(async () => {
    const _now = new Date()
    if (_now.getHours() < 4) _now.setDate(_now.getDate() - 1)
    const todayStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`
    const { data } = await supabase
      .from('appointments')
      .select('id, appointment_time, appointment_date, service, status, grooming_status, grooming_status_updated_at, grooming_started_at, assigned_groomer, assigned_bather, pets(id, name, breed, photo_url), clients(name, phone)')
      .eq('appointment_date', todayStr)
      .in('status', ['confirmed', 'in_progress', 'completed'])
      .order('appointment_time', { ascending: true })
    setAppts((data ?? []) as Appt[])
    setNow(new Date())
  }, [])

  useEffect(() => {
    fetchData()
    const iv = setInterval(fetchData, 15000) // refresh every 15s
    // Load dynamic service definitions
    fetch('/api/admin/settings').then(r => r.json()).then(d => {
      const svcVal = (d.settings ?? {})['services']
      if (svcVal) { try { setServiceDefs(JSON.parse(svcVal)) } catch { /**/ } }
    }).catch(() => {})
    return () => clearInterval(iv)
  }, [fetchData])

  // Update clock every minute
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(iv)
  }, [])

  // Group by stage
  const byStage: Record<string, Appt[]> = {}
  STAGES.forEach(s => { byStage[s.id] = [] })
  appts.forEach(a => {
    const s = a.grooming_status || 'waiting'
    if (byStage[s]) byStage[s].push(a)
  })

  const todayLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const timeLabel = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-black text-white">🐾 Kokoni Grooming Board</h1>
          <div className="flex items-center gap-1.5 bg-green-500/20 border border-green-500/40 rounded-full px-3 py-1">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-bold text-green-400">Live</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-white">{timeLabel}</p>
          <p className="text-sm text-gray-400">{todayLabel}</p>
        </div>
      </div>

      {/* Summary pills */}
      <div className="flex gap-3 mb-6">
        {STAGES.map(s => (
          <div key={s.id} className={`flex items-center gap-2 px-4 py-2 rounded-xl ${s.headerBg} border ${s.border}`}>
            <span className="text-lg">{s.icon}</span>
            <span className={`text-sm font-bold ${s.text}`}>{s.label}</span>
            <span className={`text-sm font-black w-7 h-7 rounded-full flex items-center justify-center text-white ${s.badge}`}>
              {byStage[s.id]?.length ?? 0}
            </span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2 text-gray-500 text-sm">
          <span>{appts.length} total today</span>
        </div>
      </div>

      {/* Board columns */}
      <div className="flex-1 grid grid-cols-4 gap-4">
        {STAGES.map(stage => {
          const dogs = byStage[stage.id] || []
          return (
            <div key={stage.id} className="flex flex-col">
              {/* Column header */}
              <div className={`rounded-2xl px-4 py-3 mb-3 border-2 ${stage.headerBg} ${stage.border}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{stage.icon}</span>
                    <span className={`text-base font-black ${stage.text}`}>{stage.label}</span>
                  </div>
                  <span className={`text-base font-black w-8 h-8 rounded-full flex items-center justify-center text-white ${stage.badge}`}>
                    {dogs.length}
                  </span>
                </div>
              </div>

              {/* Cards */}
              <div className="space-y-3 flex-1 overflow-y-auto">
                {dogs.map(appt => (
                  <div key={appt.id} className={`rounded-2xl border-2 ${stage.border} ${stage.bg} p-4 backdrop-blur-sm`}>
                    <div className="flex items-center gap-3 mb-2">
                      {appt.pets?.photo_url
                        ? <img src={appt.pets.photo_url} className="w-14 h-14 rounded-xl object-cover border-2 border-white/20" alt="" />
                        : <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl ${stage.headerBg}`}>🐾</div>
                      }
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-xl text-white truncate">{appt.pets?.name ?? '—'}</p>
                        <p className="text-sm text-gray-400 truncate">{appt.clients?.name}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mb-2">
                      {serviceMap[appt.service] ?? appt.service} · {appt.appointment_time}
                    </p>
                    {(appt.assigned_groomer || appt.assigned_bather) && (
                      <div className="flex gap-2 mb-2 flex-wrap">
                        {appt.assigned_groomer && <span className="text-xs font-bold text-violet-300 bg-violet-500/20 px-2 py-0.5 rounded-lg">✂️ {firstName(appt.assigned_groomer)}</span>}
                        {appt.assigned_bather && <span className="text-xs font-bold text-sky-300 bg-sky-500/20 px-2 py-0.5 rounded-lg">🛁 {firstName(appt.assigned_bather)}</span>}
                      </div>
                    )}
                    {appt.grooming_status_updated_at && (
                      <p className="text-xs text-gray-500">{timeSince(appt.grooming_status_updated_at)}</p>
                    )}
                  </div>
                ))}
                {dogs.length === 0 && (
                  <div className={`border-2 border-dashed ${stage.border} rounded-2xl py-12 text-center opacity-30`}>
                    <p className="text-sm text-gray-500">—</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
