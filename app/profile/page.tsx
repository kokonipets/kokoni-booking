'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { ChevronLeft, Pencil, Check, X, Plus, Calendar, Phone, Mail, Upload, CheckCircle2 } from 'lucide-react'
import { TagPill, type Tag as PetTag } from '@/lib/tags'

interface Pet {
  id: string
  name: string
  breed?: string | null
  weight?: string | null
  birthday?: string | null
  vaccine_status: string
  photo_url?: string | null
  tags?: PetTag[]
}

interface Appointment {
  id: string
  appointment_date: string
  appointment_time: string
  service: string
  status: string
  pets: { name: string } | null
}

interface ClientData {
  name: string
  phone: string
  email: string | null
  address: string | null
  created_at: string
}

interface Pickup {
  id: string
  name: string
  relationship: string | null
}

const SERVICE_LABELS: Record<string, string> = {
  simply_cute: 'Simply Cute',
  bath_brush: 'Bath & Brush',
  asian_fusion: 'Asian Fusion Style',
}

function parseApptDateTime(date: string, time: string): Date {
  if (/am|pm/i.test(time)) {
    const upper = time.trim().toUpperCase()
    const [t, mer] = upper.split(' ')
    const [hStr, mStr] = t.split(':')
    let h = parseInt(hStr), m = parseInt(mStr || '0')
    if (mer === 'PM' && h !== 12) h += 12
    if (mer === 'AM' && h === 12) h = 0
    const d = new Date(`${date}T00:00:00`)
    d.setHours(h, m, 0, 0)
    return d
  }
  return new Date(`${date}T${time}:00`)
}

function isMoreThan24Hours(appt: Appointment): boolean {
  const dt = parseApptDateTime(appt.appointment_date, appt.appointment_time)
  return dt.getTime() - Date.now() > 24 * 60 * 60 * 1000
}

function isBirthdayMonth(birthday: string | undefined, appointmentDate: string): boolean {
  if (!birthday) return false
  try {
    const [apptYear, apptMonth] = appointmentDate.split('-')
    const [birthdayMonth] = birthday.split('-').slice(1, 2)
    return apptMonth === birthdayMonth
  } catch {
    return false
  }
}

// ── Photo Position Modal ──────────────────────────────────────────────────────
function PhotoPositionModal({
  file,
  onConfirm,
  onCancel,
}: {
  file: File
  onConfirm: (base64: string) => void
  onCancel: () => void
}) {
  const CONTAINER = 280
  const OUTPUT = 700
  const imgUrl = useRef(URL.createObjectURL(file)).current
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)

  const scale = imgSize.w && imgSize.h
    ? Math.max(CONTAINER / imgSize.w, CONTAINER / imgSize.h)
    : 1
  const scaledW = imgSize.w * scale
  const scaledH = imgSize.h * scale
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const minX = Math.min(0, CONTAINER - scaledW)
  const minY = Math.min(0, CONTAINER - scaledH)

  const startDrag = useCallback((cx: number, cy: number) => {
    dragRef.current = { startX: cx, startY: cy, ox: offset.x, oy: offset.y }
  }, [offset])

  const moveDrag = useCallback((cx: number, cy: number) => {
    if (!dragRef.current) return
    setOffset({
      x: clamp(dragRef.current.ox + (cx - dragRef.current.startX), minX, 0),
      y: clamp(dragRef.current.oy + (cy - dragRef.current.startY), minY, 0),
    })
  }, [minX, minY])

  const endDrag = useCallback(() => { dragRef.current = null }, [])

  const handleConfirm = useCallback(() => {
    if (!imgSize.w) return
    const sourceX = -offset.x / scale
    const sourceY = -offset.y / scale
    const sourceSize = CONTAINER / scale
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT; canvas.height = OUTPUT
    const img = new window.Image()
    img.onload = () => {
      canvas.getContext('2d')!.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT, OUTPUT)
      onConfirm(canvas.toDataURL('image/jpeg', 0.88).split(',')[1])
    }
    img.src = imgUrl
  }, [imgSize, offset, scale, imgUrl, onConfirm])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="font-bold text-gray-800 text-base">Position Photo</p>
          <p className="text-sm text-gray-400 mt-0.5">Drag the photo to center it</p>
        </div>

        {/* Drag area */}
        <div className="flex justify-center py-5 bg-gray-100">
          <div
            className="relative overflow-hidden rounded-2xl cursor-grab active:cursor-grabbing select-none shadow-lg"
            style={{ width: CONTAINER, height: CONTAINER }}
            onMouseDown={e => startDrag(e.clientX, e.clientY)}
            onMouseMove={e => moveDrag(e.clientX, e.clientY)}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            onTouchStart={e => { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY) }}
            onTouchMove={e => { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY) }}
            onTouchEnd={endDrag}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgUrl}
              alt="Position preview"
              draggable={false}
              onLoad={e => {
                const t = e.currentTarget
                setImgSize({ w: t.naturalWidth, h: t.naturalHeight })
              }}
              style={{
                position: 'absolute',
                width: scaledW || '100%',
                height: scaledH || '100%',
                transform: `translate(${offset.x}px, ${offset.y}px)`,
                top: 0, left: 0,
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            />
            {/* Crop frame */}
            <div className="absolute inset-0 border-[3px] border-white/70 rounded-2xl pointer-events-none" />
            {/* Corner markers */}
            {[['top-2 left-2','border-t-2 border-l-2'],['top-2 right-2','border-t-2 border-r-2'],['bottom-2 left-2','border-b-2 border-l-2'],['bottom-2 right-2','border-b-2 border-r-2']].map(([pos, cls], i) => (
              <div key={i} className={`absolute w-5 h-5 border-white ${pos} ${cls} pointer-events-none`} />
            ))}
          </div>
        </div>
        <p className="text-center text-xs text-gray-400 -mt-3 mb-3">↕ ↔ Drag to reposition</p>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onCancel}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl text-sm transition-colors">
            Cancel
          </button>
          <button onClick={handleConfirm}
            className="flex-1 bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
            Use This Photo ✓
          </button>
        </div>
      </div>
    </div>
  )
}

function formatPhone(digits: string) {
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  return digits
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function ProfilePage() {
  // ── Phone entry ──────────────────────────────────────────
  const [phoneInput, setPhoneInput] = useState('')
  const [looking, setLooking] = useState(false)
  const [notFound, setNotFound] = useState(false)

  // ── Service definitions (dynamic) ────────────────────────
  const [serviceDefs, setServiceDefs] = useState<{id:string;name:string}[]>([])
  const serviceMap: Record<string, string> = {
    ...SERVICE_LABELS,
    ...Object.fromEntries(serviceDefs.filter(s => s.name).map(s => [s.id, s.name])),
  }

  // ── Profile data ─────────────────────────────────────────
  const [client, setClient] = useState<ClientData | null>(null)
  const [pets, setPets] = useState<Pet[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])

  // ── Edit owner ───────────────────────────────────────────
  const [editingOwner, setEditingOwner] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editStreet, setEditStreet] = useState('')
  const [editCity, setEditCity] = useState('')
  const [editState, setEditState] = useState('')
  const [editZipcode, setEditZipcode] = useState('')
  const [savingOwner, setSavingOwner] = useState(false)

  // ── Authorized pickups ───────────────────────────────────
  const [pickups, setPickups] = useState<Pickup[]>([])
  const [addingPickup, setAddingPickup] = useState(false)
  const [newPickupName, setNewPickupName] = useState('')
  const [newPickupRel, setNewPickupRel] = useState('')
  const [savingPickup, setSavingPickup] = useState(false)

  // ── Add pet ──────────────────────────────────────────────
  const [showAddPet, setShowAddPet] = useState(false)
  const [newPetName, setNewPetName] = useState('')
  const [newPetBreed, setNewPetBreed] = useState('')
  const [newPetPhotoFile, setNewPetPhotoFile] = useState<File | null>(null)
  const [newPetPreview, setNewPetPreview] = useState<string | null>(null)
  const [newPetWeight, setNewPetWeight] = useState('')
  const [newPetVaccineFile, setNewPetVaccineFile] = useState<File | null>(null)
  const [newPetVaccineEmailOnly, setNewPetVaccineEmailOnly] = useState(false)
  const [newPetVaccineSmsOnly, setNewPetVaccineSmsOnly] = useState(false)
  const newPetVaccineInputRef = useRef<HTMLInputElement>(null)
  const [addingPet, setAddingPet] = useState(false)
  const [addPetError, setAddPetError] = useState('')

  // ── Pet photo upload ─────────────────────────────────────
  const [uploadingPetId, setUploadingPetId] = useState<string | null>(null)
  const [uploadDonePetId, setUploadDonePetId] = useState<string | null>(null)
  const [cropModal, setCropModal] = useState<{ petId: string; file: File } | null>(null)

  // ── Edit pet info ────────────────────────────────────────
  const [editingPetId, setEditingPetId] = useState<string | null>(null)
  const [editPetName, setEditPetName] = useState('')
  const [editPetBreed, setEditPetBreed] = useState('')
  const [editPetWeight, setEditPetWeight] = useState('')
  const [editPetBirthday, setEditPetBirthday] = useState('')
  const [savingPet, setSavingPet] = useState(false)

  // ── Reschedule ───────────────────────────────────────────
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [rescheduleSlots, setRescheduleSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)

  // ── Cancel ───────────────────────────────────────────────
  const [cancelConfirm, setCancelConfirm] = useState<Appointment | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // ── Toast ────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null)
  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const phoneDigits = phoneInput.replace(/\D/g, '')

  // Load dynamic service names on mount
  useEffect(() => {
    fetch('/api/admin/settings').then(r => r.json()).then(d => {
      const svcVal = (d.settings ?? {})['services']
      if (svcVal) { try { setServiceDefs(JSON.parse(svcVal)) } catch { /**/ } }
    }).catch(() => {})
  }, [])

  const fetchProfile = async (digits: string) => {
    setLooking(true)
    setNotFound(false)
    try {
      const res = await fetch(`/api/client?phone=${digits}`)
      const data = await res.json()
      if (data.found) {
        setClient(data.client)
        setPets(data.pets || [])
        setAppointments(data.appointments || [])
        setPickups(data.pickups || [])
      } else {
        setNotFound(true)
      }
    } finally {
      setLooking(false)
    }
  }

  const handleLookup = () => {
    if (phoneDigits.length < 10) return
    fetchProfile(phoneDigits)
  }

  const startEditOwner = () => {
    setEditName(client?.name ?? '')
    setEditEmail(client?.email ?? '')
    // Parse address into parts (simple split by comma, or keep as individual fields)
    const addr = client?.address ?? ''
    const parts = addr.split(',').map(p => p.trim())
    setEditStreet(parts[0] ?? '')
    setEditCity(parts[1] ?? '')
    setEditState(parts[2] ?? '')
    setEditZipcode(parts[3] ?? '')
    setEditingOwner(true)
  }

  const saveOwner = async () => {
    if (!client || !editName.trim()) return
    setSavingOwner(true)
    try {
      // Combine address parts
      const addressParts = [editStreet.trim(), editCity.trim(), editState.trim(), editZipcode.trim()].filter(p => p)
      const fullAddress = addressParts.join(', ')

      const res = await fetch('/api/client', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: client.phone, name: editName.trim(), email: editEmail.trim(), address: fullAddress }),
      })
      if (res.ok) {
        setClient(prev => prev ? { ...prev, name: editName.trim(), email: editEmail.trim() || null, address: fullAddress || null } : prev)
        setEditingOwner(false)
        showToast('Profile updated ✓')
      }
    } finally {
      setSavingOwner(false)
    }
  }

  const addPickup = async () => {
    if (!client || !newPickupName.trim()) return
    setSavingPickup(true)
    try {
      const res = await fetch('/api/client/pickups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: client.phone, name: newPickupName.trim(), relationship: newPickupRel.trim() }),
      })
      const data = await res.json()
      if (data.pickup) {
        setPickups(prev => [...prev, data.pickup])
        setNewPickupName('')
        setNewPickupRel('')
        setAddingPickup(false)
        showToast('Pickup person added ✓')
      }
    } finally {
      setSavingPickup(false)
    }
  }

  const removePickup = async (id: string) => {
    try {
      await fetch('/api/client/pickups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setPickups(prev => prev.filter(p => p.id !== id))
      showToast('Removed ✓')
    } catch { showToast('⚠️ Could not remove') }
  }

  const uploadPetPhoto = async (petId: string, file: File) => {
    // Validate file type
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
      showToast('⚠️ Please use a JPG, PNG, or WEBP photo')
      return
    }
    // Validate raw file size (50MB absolute max — we compress below)
    if (file.size > 50 * 1024 * 1024) {
      showToast('⚠️ Photo is too large (max 50 MB). Please choose a smaller file.')
      return
    }

    // Show instant local preview
    const localUrl = URL.createObjectURL(file)
    setPets(prev => prev.map(p => p.id === petId ? { ...p, photo_url: localUrl } : p))
    setUploadingPetId(petId)

    try {
      // Compress image with Canvas — resizes to max 1200px and converts to JPEG
      // This keeps the payload well under Vercel's 4.5MB limit for any photo
      const base64 = await new Promise<string>((resolve, reject) => {
        const img = new window.Image()
        img.onload = () => {
          const MAX = 1200
          let { width, height } = img
          if (width > MAX || height > MAX) {
            if (width > height) { height = Math.round((height / width) * MAX); width = MAX }
            else { width = Math.round((width / height) * MAX); height = MAX }
          }
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
          // toDataURL gives "data:image/jpeg;base64,..." — strip the prefix
          resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1])
        }
        img.onerror = reject
        img.src = URL.createObjectURL(file)
      })

      const res = await fetch('/api/pets/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ petId, fileBase64: base64, contentType: 'image/jpeg', ext: 'jpg' }),
      })
      const data = await res.json()
      if (data.url) {
        setPets(prev => prev.map(p => p.id === petId ? { ...p, photo_url: data.url } : p))
        setUploadDonePetId(petId)
        setTimeout(() => setUploadDonePetId(null), 2000)
        showToast('Photo updated! 📷')
      } else {
        showToast('⚠️ ' + (data.error || 'Upload failed'))
        setPets(prev => prev.map(p => p.id === petId ? { ...p, photo_url: null } : p))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast('⚠️ Error: ' + msg)
      setPets(prev => prev.map(p => p.id === petId ? { ...p, photo_url: null } : p))
    } finally {
      setUploadingPetId(null)
    }
  }

  const startEditPet = (pet: Pet) => {
    setEditingPetId(pet.id)
    setEditPetName(pet.name)
    setEditPetBreed(pet.breed ?? '')
    setEditPetWeight(pet.weight ?? '')
    setEditPetBirthday(pet.birthday ?? '')
  }

  const savePet = async () => {
    if (!editingPetId || !editPetName.trim()) return
    setSavingPet(true)
    try {
      const res = await fetch('/api/pets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          petId: editingPetId,
          name: editPetName.trim(),
          breed: editPetBreed.trim() || null,
          weight: editPetWeight.trim() || null,
          birthday: editPetBirthday || null,
        }),
      })
      if (res.ok) {
        setPets(prev => prev.map(p => p.id === editingPetId ? {
          ...p,
          name: editPetName.trim(),
          breed: editPetBreed.trim() || undefined,
          weight: editPetWeight.trim() || undefined,
          birthday: editPetBirthday || undefined,
        } : p))
        showToast('Pet info updated ✓')
      } else {
        showToast('Failed to save. Try again.')
      }
    } catch (err) {
      console.error('Error saving pet:', err)
      showToast('Error saving pet info')
    } finally {
      setSavingPet(false)
      setEditingPetId(null) // Always close the form
    }
  }

  const addPet = async () => {
    if (!newPetName.trim()) { setAddPetError("Please enter a name."); return }
    if (!client) return
    setAddingPet(true)
    setAddPetError('')
    try {
      // 1. Upload vaccine file first (if provided)
      let vaccineFileUrl: string | null = null
      if (newPetVaccineFile) {
        const formData = new FormData()
        formData.append('file', newPetVaccineFile)
        formData.append('phone', client.phone)
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData })
        const uploadData = await uploadRes.json()
        if (uploadData.url) vaccineFileUrl = uploadData.url
      }

      const res = await fetch('/api/pets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: client.phone,
          name: newPetName.trim(),
          breed: newPetBreed.trim(),
          weight: newPetWeight || null,
          vaccineFileUrl,
          vaccineEmailOnly: newPetVaccineEmailOnly,
          vaccineSmsOnly: newPetVaccineSmsOnly,
        }),
      })
      const data = await res.json()
      if (data.pet) {
        const newPet: Pet = { ...data.pet, photo_url: newPetPreview || null }
        setPets(prev => [...prev, newPet])
        if (newPetPhotoFile && data.pet.id) {
          await uploadPetPhoto(data.pet.id, newPetPhotoFile)
        }
        setShowAddPet(false)
        setNewPetName('')
        setNewPetBreed('')
        setNewPetPhotoFile(null)
        setNewPetPreview(null)
        setNewPetWeight('')
        setNewPetVaccineFile(null)
        setNewPetVaccineEmailOnly(false)
        setNewPetVaccineSmsOnly(false)
        showToast(`${data.pet.name} added! 🐶`)
      } else {
        setAddPetError(data.error || 'Failed to add pet.')
      }
    } finally {
      setAddingPet(false)
    }
  }

  // Upload a pre-cropped base64 JPEG for a pet
  const uploadBase64Photo = async (petId: string, base64: string) => {
    setUploadingPetId(petId)
    try {
      const res = await fetch('/api/pets/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ petId, fileBase64: base64, contentType: 'image/jpeg', ext: 'jpg' }),
      })
      const data = await res.json()
      if (data.url) {
        setPets(prev => prev.map(p => p.id === petId ? { ...p, photo_url: data.url } : p))
        setUploadDonePetId(petId)
        setTimeout(() => setUploadDonePetId(null), 2000)
        showToast('Photo updated! 📷')
      } else {
        showToast('⚠️ ' + (data.error || 'Upload failed'))
      }
    } catch {
      showToast('⚠️ Upload failed')
    } finally {
      setUploadingPetId(null)
      setCropModal(null)
    }
  }

  // Load available reschedule slots when date changes
  const loadSlots = async (date: string) => {
    if (!date) return
    setLoadingSlots(true)
    setRescheduleSlots([])
    setRescheduleTime('')
    try {
      const res = await fetch(`/api/slots?date=${date}`)
      const data = await res.json()
      setRescheduleSlots(data.slots ?? [])
    } catch { /* ignore */ }
    setLoadingSlots(false)
  }

  const confirmReschedule = async () => {
    if (!rescheduleAppt || !rescheduleDate || !rescheduleTime) return
    setRescheduling(true)
    try {
      const res = await fetch(`/api/admin/appointments/${rescheduleAppt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reschedule', appointment_date: rescheduleDate, appointment_time: rescheduleTime }),
      })
      const data = await res.json()
      if (data.success || data.appointment) {
        setAppointments(prev => prev.map(a => a.id === rescheduleAppt.id
          ? { ...a, appointment_date: rescheduleDate, appointment_time: rescheduleTime }
          : a))
        showToast('Appointment rescheduled ✓')
        setRescheduleAppt(null)
      } else {
        showToast('⚠️ ' + (data.error || 'Could not reschedule'))
      }
    } catch {
      showToast('⚠️ Something went wrong')
    }
    setRescheduling(false)
  }

  const confirmCancel = async () => {
    if (!cancelConfirm) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/admin/appointments/${cancelConfirm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-status', status: 'cancelled' }),
      })
      const data = await res.json()
      if (data.success || data.appointment) {
        setAppointments(prev => prev.map(a => a.id === cancelConfirm.id ? { ...a, status: 'cancelled' } : a))
        showToast('Appointment cancelled')
        setCancelConfirm(null)
      } else {
        showToast('⚠️ ' + (data.error || 'Could not cancel'))
      }
    } catch {
      showToast('⚠️ Something went wrong')
    }
    setCancelling(false)
  }

  // ── PHONE ENTRY SCREEN ───────────────────────────────────
  if (!client) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white flex flex-col items-center justify-center p-6">
        {toast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white px-5 py-2.5 rounded-full text-sm shadow-lg">
            {toast}
          </div>
        )}
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <Image src="/logo.png" alt="Kokoni Pet Grooming Salon" width={100} height={100} className="mb-3" />
            <h1 className="text-2xl font-bold text-sky-900">My Profile</h1>
            <p className="text-sm text-gray-500 mt-1">Enter your phone number to view your profile</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-3 focus-within:ring-2 focus-within:ring-sky-400">
              <Phone className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                type="tel"
                inputMode="numeric"
                placeholder="(xxx) xxx-xxxx"
                value={phoneInput}
                onChange={e => { setPhoneInput(e.target.value); setNotFound(false) }}
                onKeyDown={e => e.key === 'Enter' && handleLookup()}
                className="flex-1 outline-none text-gray-800 text-base"
              />
            </div>

            {notFound && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
                No account found with that number.{' '}
                <a href="/book" className="font-semibold underline">Book your first appointment →</a>
              </div>
            )}

            <button
              onClick={handleLookup}
              disabled={phoneDigits.length < 10 || looking}
              className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {looking ? 'Looking up...' : 'View My Profile'}
            </button>

            <a href="/book" className="block text-center text-sm text-sky-600 hover:underline">
              Book an appointment instead →
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ── PROFILE SCREEN ───────────────────────────────────────
  const upcoming = appointments.filter(a => a.status === 'confirmed' || a.status === 'pending')
  const past = appointments.filter(a => a.status === 'completed' || a.status === 'cancelled')

  return (
    <div className="min-h-screen bg-gray-50">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white px-5 py-2.5 rounded-full text-sm shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3 sticky top-0 z-40">
        <a href="/book" className="text-sky-600">
          <ChevronLeft className="w-5 h-5" />
        </a>
        <Image src="/logo.png" alt="Kokoni" width={32} height={32} />
        <h1 className="font-bold text-gray-800">My Profile</h1>
        <button
          onClick={() => setClient(null)}
          className="ml-auto text-xs text-gray-400 hover:text-gray-600"
        >
          Sign out
        </button>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4 pb-16">

        {/* ── OWNER CARD ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-sky-600 px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-2xl">
                👤
              </div>
              <div>
                <p className="text-white font-bold text-lg leading-tight">{client.name}</p>
                <p className="text-sky-100 text-sm">{formatPhone(client.phone)}</p>
              </div>
            </div>
            {!editingOwner && (
              <button
                onClick={startEditOwner}
                className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition-colors"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="px-5 py-4">
            {!editingOwner ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-400 w-16 shrink-0">Email</span>
                  <span className="text-gray-700">{client.email || <span className="text-gray-400 italic">Not set</span>}</span>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <span className="text-gray-400 w-16 shrink-0 pt-0.5">Address</span>
                  <span className="text-gray-700">{client.address || <span className="text-gray-400 italic">Not set</span>}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-400 w-16 shrink-0">Member</span>
                  <span className="text-gray-700">{new Date(client.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Name</label>
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Email</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={e => setEditEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Street Address</label>
                  <input
                    value={editStreet}
                    onChange={e => setEditStreet(e.target.value)}
                    placeholder="123 Main St"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">City</label>
                    <input
                      value={editCity}
                      onChange={e => setEditCity(e.target.value)}
                      placeholder="Los Angeles"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">State</label>
                    <input
                      value={editState}
                      onChange={e => setEditState(e.target.value)}
                      placeholder="CA"
                      maxLength={2}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 uppercase"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Zip Code</label>
                  <input
                    value={editZipcode}
                    onChange={e => setEditZipcode(e.target.value)}
                    placeholder="90210"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={saveOwner}
                    disabled={savingOwner || !editName.trim()}
                    className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-semibold py-2 rounded-xl text-sm flex items-center justify-center gap-1"
                  >
                    <Check className="w-4 h-4" /> {savingOwner ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingOwner(false)}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold py-2 rounded-xl text-sm flex items-center justify-center gap-1"
                  >
                    <X className="w-4 h-4" /> Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── AUTHORIZED PICKUPS ──────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-800 text-base">🔑 Authorized Pickup</h2>
            <button
              onClick={() => setAddingPickup(!addingPickup)}
              className="flex items-center gap-1 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Person
            </button>
          </div>

          <p className="text-xs text-gray-400 mb-3">People who have permission to pick up your dog</p>

          {/* Add pickup form */}
          {addingPickup && (
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 mb-3 space-y-2">
              <input
                placeholder="Full name *"
                value={newPickupName}
                onChange={e => setNewPickupName(e.target.value)}
                className="w-full border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
              <input
                placeholder="Relationship (e.g. Spouse, Friend)"
                value={newPickupRel}
                onChange={e => setNewPickupRel(e.target.value)}
                className="w-full border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={addPickup}
                  disabled={savingPickup || !newPickupName.trim()}
                  className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
                >
                  {savingPickup ? 'Saving...' : '+ Add'}
                </button>
                <button
                  onClick={() => { setAddingPickup(false); setNewPickupName(''); setNewPickupRel('') }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold py-2 rounded-lg text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Pickup list */}
          {pickups.length === 0 && !addingPickup && (
            <p className="text-sm text-gray-400 italic text-center py-2">No authorized pickup people yet</p>
          )}
          <div className="space-y-2">
            {pickups.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center text-sm">👤</div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.name}</p>
                    {p.relationship && <p className="text-xs text-gray-400">{p.relationship}</p>}
                  </div>
                </div>
                <button
                  onClick={() => removePickup(p.id)}
                  className="text-red-400 hover:text-red-600 p-1 rounded transition-colors"
                  title="Remove"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── PETS SECTION ────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-800 text-base">🐾 My Dogs</h2>
            <button
              onClick={() => setShowAddPet(!showAddPet)}
              className="flex items-center gap-1 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Dog
            </button>
          </div>

          {/* Add pet form */}
          {showAddPet && (
            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 mb-3 space-y-3">
              <p className="text-sm font-semibold text-sky-800">New Dog</p>

              {/* Photo picker */}
              <label className="flex items-center gap-3 cursor-pointer">
                {newPetPreview ? (
                  <img src={newPetPreview} alt="preview" className="w-14 h-14 rounded-full object-cover border-2 border-sky-300" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-white border-2 border-dashed border-sky-300 flex items-center justify-center text-2xl">
                    📷
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-sky-700">{newPetPhotoFile ? 'Change photo' : 'Add a photo'}</p>
                  <p className="text-xs text-gray-400">Optional</p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) { setNewPetPhotoFile(f); setNewPetPreview(URL.createObjectURL(f)) }
                  }}
                />
              </label>

              <input
                placeholder="Dog's name *"
                value={newPetName}
                onChange={e => setNewPetName(e.target.value)}
                className="w-full border border-sky-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
              <input
                placeholder="Breed (optional)"
                value={newPetBreed}
                onChange={e => setNewPetBreed(e.target.value)}
                className="w-full border border-sky-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
              />

              {/* Weight selection */}
              <div>
                <p className="text-xs font-semibold text-sky-800 mb-1.5">Weight</p>
                <div className="grid grid-cols-2 gap-2">
                  {['Small (under 10 lbs)', 'Medium (11–25 lbs)', 'Large (26–45 lbs)', 'XL (45+ lbs)'].map(w => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setNewPetWeight(newPetWeight === w ? '' : w)}
                      className={`py-2 rounded-xl text-xs font-medium border-2 transition-all ${newPetWeight === w ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 bg-white text-gray-600 hover:border-sky-300'}`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vaccine records */}
              <div>
                <p className="text-xs font-semibold text-sky-800 mb-1.5">Vaccination records</p>
                <div className="space-y-2">
                  {/* Upload option */}
                  <div
                    className={`rounded-xl p-3 text-center cursor-pointer transition-all border-2 border-dashed ${newPetVaccineFile ? 'bg-green-50 border-green-400' : 'border-sky-300 bg-white'} ${newPetVaccineEmailOnly || newPetVaccineSmsOnly ? 'opacity-40 pointer-events-none' : ''}`}
                    onClick={() => !newPetVaccineEmailOnly && !newPetVaccineSmsOnly && newPetVaccineInputRef.current?.click()}
                  >
                    <input
                      ref={newPetVaccineInputRef}
                      type="file"
                      className="hidden"
                      accept="image/*,.pdf"
                      onChange={e => {
                        if (e.target.files?.[0]) {
                          setNewPetVaccineFile(e.target.files[0])
                          setNewPetVaccineEmailOnly(false)
                          setNewPetVaccineSmsOnly(false)
                        }
                      }}
                    />
                    {newPetVaccineFile ? (
                      <div className="flex items-center justify-center gap-2 text-green-700">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-xs font-medium truncate">{newPetVaccineFile.name}</span>
                      </div>
                    ) : (
                      <div>
                        <Upload className="w-5 h-5 text-sky-500 mx-auto mb-0.5" />
                        <p className="text-xs font-medium text-sky-700">Upload vaccination records</p>
                        <p className="text-[10px] text-gray-400">JPG, PNG, or PDF</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-[10px] text-gray-400">or</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>

                  {/* Email option */}
                  <button
                    type="button"
                    onClick={() => { setNewPetVaccineEmailOnly(!newPetVaccineEmailOnly); setNewPetVaccineSmsOnly(false); setNewPetVaccineFile(null) }}
                    className={`w-full flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-left ${newPetVaccineEmailOnly ? 'border-sky-500 bg-sky-50' : 'border-gray-200 bg-white hover:border-sky-200'}`}
                  >
                    <Mail className="w-4 h-4 text-sky-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-800">I&apos;ll email my records</p>
                      <p className="text-[10px] text-gray-400 truncate">kokonipets@gmail.com</p>
                    </div>
                    {newPetVaccineEmailOnly && <CheckCircle2 className="w-4 h-4 text-sky-500 ml-auto shrink-0" />}
                  </button>

                  {/* Text option */}
                  <button
                    type="button"
                    onClick={() => { setNewPetVaccineSmsOnly(!newPetVaccineSmsOnly); setNewPetVaccineEmailOnly(false); setNewPetVaccineFile(null) }}
                    className={`w-full flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-left ${newPetVaccineSmsOnly ? 'border-sky-500 bg-sky-50' : 'border-gray-200 bg-white hover:border-sky-200'}`}
                  >
                    <Phone className="w-4 h-4 text-sky-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-800">I&apos;ll text my records</p>
                      <p className="text-[10px] text-gray-400">(626) 621-4646</p>
                    </div>
                    {newPetVaccineSmsOnly && <CheckCircle2 className="w-4 h-4 text-sky-500 ml-auto shrink-0" />}
                  </button>
                </div>
              </div>

              {addPetError && <p className="text-red-500 text-xs">{addPetError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={addPet}
                  disabled={addingPet}
                  className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-semibold py-2 rounded-xl text-sm"
                >
                  {addingPet ? 'Adding...' : '+ Add Dog'}
                </button>
                <button
                  onClick={() => { setShowAddPet(false); setNewPetName(''); setNewPetBreed(''); setNewPetPhotoFile(null); setNewPetPreview(null); setNewPetWeight(''); setNewPetVaccineFile(null); setNewPetVaccineEmailOnly(false); setNewPetVaccineSmsOnly(false); setAddPetError('') }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold py-2 rounded-xl text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Pet cards */}
          <div className="grid grid-cols-2 gap-3">
            {pets.map(pet => (
              <div key={pet.id}>
                {editingPetId === pet.id ? (
                  // Edit form
                  <div className="bg-sky-50 border-2 border-sky-300 rounded-2xl p-4 space-y-3">
                    <p className="text-sm font-semibold text-sky-800">Edit {pet.name}</p>
                    <input
                      placeholder="Name *"
                      value={editPetName}
                      onChange={e => setEditPetName(e.target.value)}
                      className="w-full border border-sky-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                    <input
                      placeholder="Breed (optional)"
                      value={editPetBreed}
                      onChange={e => setEditPetBreed(e.target.value)}
                      className="w-full border border-sky-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                    <input
                      placeholder="Weight (optional)"
                      value={editPetWeight}
                      onChange={e => setEditPetWeight(e.target.value)}
                      className="w-full border border-sky-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                    <input
                      type="date"
                      placeholder="Birthday (optional)"
                      value={editPetBirthday}
                      onChange={e => setEditPetBirthday(e.target.value)}
                      className="w-full border border-sky-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={savePet}
                        disabled={savingPet || !editPetName.trim()}
                        className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
                      >
                        {savingPet ? 'Saving...' : '✓ Save'}
                      </button>
                      <button
                        onClick={() => setEditingPetId(null)}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold py-2 rounded-lg text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // Display card
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-full flex flex-col">
                    {/* Photo */}
                    <div className="relative">
                      {pet.photo_url ? (
                        <img src={pet.photo_url} alt={pet.name} className="w-full h-32 object-cover" />
                      ) : (
                        <div className="w-full h-32 bg-sky-50 flex items-center justify-center text-5xl">🐶</div>
                      )}
                      {/* Photo upload overlay */}
                      <label className={`absolute bottom-2 right-2 text-white rounded-full p-1.5 cursor-pointer transition-colors ${uploadingPetId === pet.id ? 'bg-sky-500' : uploadDonePetId === pet.id ? 'bg-green-500' : 'bg-black/50 hover:bg-black/70'}`}>
                        {uploadingPetId === pet.id ? (
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                          </svg>
                        ) : uploadDonePetId === pet.id ? (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          disabled={!!uploadingPetId}
                          onChange={e => {
                            const f = e.target.files?.[0]
                            if (f) {
                              // Show local preview immediately
                              setPets(prev => prev.map(p => p.id === pet.id ? { ...p, photo_url: URL.createObjectURL(f) } : p))
                              setCropModal({ petId: pet.id, file: f })
                            }
                            e.target.value = ''
                          }}
                        />
                      </label>
                      {/* Hint shown only when no photo yet */}
                      {!pet.photo_url && uploadingPetId !== pet.id && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-center py-1" style={{fontSize:'10px'}}>
                          Tap 📷 to add · drag to center
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3 flex-1 flex flex-col">
                      <p className="font-bold text-gray-800 text-sm">{pet.name}</p>
                      {pet.breed && <p className="text-xs text-gray-500 mt-0.5">{pet.breed}</p>}
                      {pet.weight && <p className="text-xs text-gray-500">{pet.weight}</p>}
                      <span className={`inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium w-fit ${
                        pet.vaccine_status === 'verified' ? 'bg-green-100 text-green-700' :
                        pet.vaccine_status === 'email_sent' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-600'
                      }`}>
                        {pet.vaccine_status === 'verified' ? '✓ Vaccinated' :
                         pet.vaccine_status === 'email_sent' ? 'Records Pending' : 'No Records'}
                      </span>
                      {pet.tags && pet.tags.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap mt-1.5">
                          {pet.tags.map(t => <TagPill key={t.id} tag={t} size="xs" />)}
                        </div>
                      )}
                      <button
                        onClick={() => startEditPet(pet)}
                        className="mt-auto pt-2 text-xs text-sky-600 hover:text-sky-700 font-semibold"
                      >
                        ✏️ Edit Info
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {pets.length === 0 && !showAddPet && (
              <div className="col-span-2 text-center py-8 text-gray-400 text-sm">
                No dogs yet. Add your first dog!
              </div>
            )}
          </div>
        </div>

        {/* ── APPOINTMENTS ────────────────────────────────── */}
        <div>
          <h2 className="font-bold text-gray-800 text-base mb-3">
            <Calendar className="w-4 h-4 inline mr-1.5 text-sky-600" />
            Appointments
          </h2>

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Upcoming</p>
              <div className="space-y-3">
                {upcoming.map(appt => {
                  // Pending appointments can always be rescheduled/cancelled (not yet confirmed)
                  // Confirmed appointments require 24h notice
                  const canModify = appt.status === 'pending' || isMoreThan24Hours(appt)
                  const pet = pets.find(p => p.name === appt.pets?.name)
                  const isBirthday = pet && isBirthdayMonth(pet.birthday, appt.appointment_date)
                  return (
                    <div key={appt.id} className={`rounded-xl border shadow-sm overflow-hidden ${isBirthday ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
                      {/* Appointment info row */}
                      <div className="px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                            {appt.pets?.name ?? '—'}
                            {isBirthday && <span className="text-lg" title="Birthday month!">🎂</span>}
                          </p>
                          <p className="text-xs text-gray-500">{serviceMap[appt.service] ?? appt.service}</p>
                          <p className="text-xs text-sky-600 font-medium mt-0.5">{formatDate(appt.appointment_date)} · {appt.appointment_time}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          appt.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {appt.status === 'confirmed' ? 'Confirmed ✓' : 'Pending'}
                        </span>
                      </div>

                      {/* Action buttons or note */}
                      {canModify ? (
                        <div className="border-t border-gray-50 px-4 py-2.5 flex items-center gap-2">
                          <button
                            onClick={() => { setRescheduleAppt(appt); setRescheduleDate(''); setRescheduleTime(''); setRescheduleSlots([]) }}
                            className="flex-1 text-xs font-semibold text-sky-600 border border-sky-200 rounded-lg py-1.5 hover:bg-sky-50 transition-colors"
                          >
                            🔄 Reschedule
                          </button>
                          <button
                            onClick={() => setCancelConfirm(appt)}
                            className="flex-1 text-xs font-semibold text-red-500 border border-red-200 rounded-lg py-1.5 hover:bg-red-50 transition-colors"
                          >
                            ✕ Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="border-t border-gray-50 px-4 py-2 bg-amber-50">
                          <p className="text-xs text-amber-700">
                            For last-minute changes, call us at <a href="tel:6266214646" className="underline">(626) 621-4646</a>
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {/* 24h policy note */}
              <p className="text-xs text-gray-400 mt-2.5 leading-relaxed">
                ℹ️ Reschedule or cancel up to <strong>24 hours before</strong> your appointment. For last-minute changes, please contact us directly.
              </p>
            </div>
          )}

          {/* Past */}
          {past.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Past</p>
              <div className="space-y-2">
                {past.slice(0, 8).map(appt => (
                  <div key={appt.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between opacity-70">
                    <div>
                      <p className="font-semibold text-gray-700 text-sm">{appt.pets?.name ?? '—'}</p>
                      <p className="text-xs text-gray-500">{serviceMap[appt.service] ?? appt.service} · {formatDate(appt.appointment_date)}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      appt.status === 'completed' ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-400'
                    }`}>
                      {appt.status === 'completed' ? 'Done' : 'Cancelled'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {appointments.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              No appointments yet.{' '}
              <a href="/book" className="text-sky-600 underline">Book now →</a>
            </div>
          )}

          <a
            href="/book"
            className="block w-full mt-4 text-center bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
          >
            + Book Another Appointment
          </a>
        </div>
      </div>

      {/* ── Photo Crop Modal ─────────────────────────────── */}
      {cropModal && (
        <PhotoPositionModal
          file={cropModal.file}
          onConfirm={base64 => uploadBase64Photo(cropModal.petId, base64)}
          onCancel={() => {
            // Revert preview
            setPets(prev => prev.map(p => p.id === cropModal.petId ? { ...p, photo_url: null } : p))
            setCropModal(null)
          }}
        />
      )}

      {/* ── Reschedule Modal ─────────────────────────────── */}
      {rescheduleAppt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-sky-600 px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-white font-bold">Reschedule Appointment</p>
                <p className="text-sky-200 text-xs mt-0.5">{rescheduleAppt.pets?.name} · {serviceMap[rescheduleAppt.service] ?? rescheduleAppt.service}</p>
              </div>
              <button onClick={() => setRescheduleAppt(null)} className="text-white/60 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              {/* Date picker */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">New Date</label>
                <input
                  type="date"
                  value={rescheduleDate}
                  min={new Date(Date.now() + 24*60*60*1000).toISOString().split('T')[0]}
                  onChange={e => { setRescheduleDate(e.target.value); loadSlots(e.target.value) }}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-sky-400"
                />
              </div>

              {/* Time slots */}
              {rescheduleDate && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Available Times</label>
                  {loadingSlots ? (
                    <p className="text-gray-400 text-sm text-center py-3">Loading times…</p>
                  ) : rescheduleSlots.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-3">No available times on this day.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {rescheduleSlots.map(slot => (
                        <button key={slot} onClick={() => setRescheduleTime(slot)}
                          className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                            rescheduleTime === slot
                              ? 'bg-sky-600 text-white border-sky-600'
                              : 'border-gray-200 text-gray-700 hover:border-sky-300'
                          }`}>
                          {slot}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setRescheduleAppt(null)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl text-sm transition-colors">
                  Cancel
                </button>
                <button
                  onClick={confirmReschedule}
                  disabled={!rescheduleDate || !rescheduleTime || rescheduling}
                  className="flex-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
                  {rescheduling ? 'Saving…' : 'Confirm New Time'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Confirm ───────────────────────────────── */}
      {cancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <p className="text-4xl mb-3">❌</p>
            <p className="font-bold text-gray-800 text-lg mb-1">Cancel Appointment?</p>
            <p className="text-gray-500 text-sm mb-1">
              {cancelConfirm.pets?.name} · {serviceMap[cancelConfirm.service] ?? cancelConfirm.service}
            </p>
            <p className="text-sky-600 text-sm font-medium mb-4">
              {formatDate(cancelConfirm.appointment_date)} · {cancelConfirm.appointment_time}
            </p>
            <p className="text-xs text-gray-400 mb-5">This cannot be undone. A $30 fee may apply for late cancellations.</p>
            <div className="flex gap-3">
              <button onClick={() => setCancelConfirm(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl text-sm transition-colors">
                Keep It
              </button>
              <button onClick={confirmCancel} disabled={cancelling}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
                {cancelling ? 'Cancelling…' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
