'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'

type CheckinStatus = 'checked_in' | 'waiting' | 'bath_brush' | 'styling' | 'ready' | 'checked_out'

type Dog = {
  id: string
  service: string
  appointment_time: string
  notes: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clients: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pets: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dog_checkins: any[]
}

const STAGES: { key: CheckinStatus; label: string; emoji: string; color: string; bg: string }[] = [
  { key: 'checked_in',  label: 'Checked In',   emoji: '🐾', color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  { key: 'waiting',     label: 'Waiting',       emoji: '⏳', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' },
  { key: 'bath_brush',  label: 'Bath & Brush',  emoji: '🛁', color: 'text-cyan-700',   bg: 'bg-cyan-50 border-cyan-200' },
  { key: 'styling',     label: 'Styling',       emoji: '✂️', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
  { key: 'ready',       label: 'Ready!',        emoji: '⭐', color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  { key: 'checked_out', label: 'Checked Out',   emoji: '🏠', color: 'text-gray-500',   bg: 'bg-gray-50 border-gray-200' },
]

const SERVICE_SHORT: Record<string, string> = {
  simply_cute: 'Simply Cute',
  bath_brush: 'Bath & Brush',
  asian_fusion: 'Asian Fusion',
}

function getDogStatus(dog: Dog): CheckinStatus {
  if (dog.dog_checkins && dog.dog_checkins.length > 0) {
    return dog.dog_checkins[0].status as CheckinStatus
  }
  return 'checked_in'
}

export default function StatusPage() {
  const [dogs, setDogs] = useState<Dog[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [selectedDog, setSelectedDog] = useState<Dog | null>(null)
  const [serviceDefs, setServiceDefs] = useState<{id:string;name:string}[]>([])
  const serviceMap: Record<string, string> = {
    ...SERVICE_SHORT,
    ...Object.fromEntries(serviceDefs.filter(s => s.name).map(s => [s.id, s.name.slice(0, 14)])),
  }

  // Helper to get button text based on loading state
  const getStageButtonText = (stageLabel: string) => {
    if (!updating || !selectedDog) return stageLabel
    return `⏳ Updating...`
  }

  const fetchDogs = useCallback(async () => {
    const res = await fetch('/api/admin/checkin')
    const data = await res.json()
    setDogs(data.appointments || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchDogs()
    fetch('/api/admin/settings').then(r => r.json()).then(d => {
      const svcVal = (d.settings ?? {})['services']
      if (svcVal) { try { setServiceDefs(JSON.parse(svcVal)) } catch { /**/ } }
    }).catch(() => {})
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchDogs, 30000)
    return () => clearInterval(interval)
  }, [fetchDogs])

  const updateStatus = async (dogId: string, status: CheckinStatus) => {
    setUpdating(dogId)
    await fetch('/api/admin/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId: dogId, status }),
    })
    await fetchDogs()
    setUpdating(null)
    setSelectedDog(null)
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Kokoni" width={36} height={36} />
          <div>
            <h1 className="font-bold text-gray-800 text-sm leading-tight">Dog Status Board</h1>
            <p className="text-xs text-gray-400">{today}</p>
          </div>
        </div>
        <button
          onClick={fetchDogs}
          className="text-sky-500 text-xl hover:text-sky-600"
          title="Refresh"
        >
          ↻
        </button>
      </div>

      {loading && (
        <div className="text-center py-20 text-gray-400 text-sm">Loading...</div>
      )}

      {!loading && dogs.length === 0 && (
        <div className="text-center py-20">
          <div className="text-5xl mb-3">🐾</div>
          <p className="text-gray-400">No confirmed appointments today</p>
        </div>
      )}

      {/* Status columns */}
      {!loading && dogs.length > 0 && (
        <div className="p-4 space-y-4">
          {STAGES.map((stage) => {
            const stageDogs = dogs.filter(d => getDogStatus(d) === stage.key)
            return (
              <div key={stage.key}>
                {/* Stage header */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{stage.emoji}</span>
                  <h2 className={`font-bold text-sm ${stage.color}`}>{stage.label}</h2>
                  {stageDogs.length > 0 && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stage.bg} ${stage.color} border`}>
                      {stageDogs.length}
                    </span>
                  )}
                </div>

                {stageDogs.length === 0 ? (
                  <div className={`border-2 border-dashed rounded-xl p-3 text-center text-xs text-gray-300 ${stage.key === 'checked_out' ? 'hidden' : ''}`}>
                    None
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stageDogs.map((dog) => (
                      <div
                        key={dog.id}
                        onClick={() => setSelectedDog(dog)}
                        className={`bg-white border-2 rounded-xl p-3 cursor-pointer hover:shadow-md transition-shadow ${stage.bg}`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold text-gray-800">{dog.pets?.name ?? '—'}</p>
                            <p className="text-xs text-gray-500">{dog.pets?.breed ?? ''}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-medium text-gray-600">{dog.appointment_time}</p>
                            <p className="text-xs text-gray-400">{serviceMap[dog.service] ?? dog.service}</p>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <p className="text-xs text-gray-400">Owner: {dog.clients?.name ?? '—'}</p>
                          {updating === dog.id ? (
                            <span className="text-xs text-gray-400">Updating...</span>
                          ) : (
                            <span className="text-xs text-sky-500 font-medium">Tap to move →</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Stage picker modal */}
      {selectedDog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setSelectedDog(null)}>
          <div
            className="bg-white w-full rounded-t-2xl p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div>
                <p className="font-bold text-gray-800 text-lg">{selectedDog.pets?.name}</p>
                <p className="text-sm text-gray-400">{selectedDog.pets?.breed} · {selectedDog.appointment_time}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 uppercase font-semibold mb-3">Move to stage:</p>
            <div className="grid grid-cols-2 gap-2">
              {STAGES.map((stage) => {
                const current = getDogStatus(selectedDog) === stage.key
                const isUpdating = updating !== null
                return (
                  <button
                    key={stage.key}
                    onClick={() => updateStatus(selectedDog.id, stage.key)}
                    disabled={current || isUpdating}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all ${
                      current
                        ? `${stage.bg} ${stage.color} border-current font-bold`
                        : isUpdating
                        ? 'border-gray-300 bg-gray-100 text-gray-500'
                        : 'border-gray-100 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    <span className="text-xl">{stage.emoji}</span>
                    <span className="text-sm font-medium">{isUpdating ? '⏳ Updating...' : stage.label}</span>
                    {current && <span className="ml-auto text-xs">✓</span>}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setSelectedDog(null)}
              className="w-full mt-3 py-3 text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
