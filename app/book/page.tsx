'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import {
  ChevronLeft,
  ChevronRight,
  Upload,
  CheckCircle2,
  Mail,
  Phone,
  Calendar,
  Clock,
  Scissors,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────
type Step = 'phone' | 'new-client' | 'select-pet' | 'service' | 'datetime' | 'vaccine-notes' | 'tos' | 'confirmed'

const BREED_SUGGESTIONS = [
  'Labrador Retriever','Golden Retriever','French Bulldog','German Shepherd','Poodle',
  'Bulldog','Beagle','Rottweiler','Dachshund','Siberian Husky','Shih Tzu','Chihuahua',
  'Yorkshire Terrier','Maltese','Pomeranian','Bichon Frise','Cavalier King Charles Spaniel',
  'Shih Poo','Goldendoodle','Labradoodle','Bernedoodle','Cockapoo','Mini Schnauzer',
  'Havanese','Samoyed','Corgi','Boxer','Doberman','Border Collie','Australian Shepherd',
  'Great Dane','Saint Bernard','Bernese Mountain Dog','Miniature Pinscher','Cocker Spaniel',
]

function BreedInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const filtered = BREED_SUGGESTIONS.filter(b =>
    b.toLowerCase().includes(value.toLowerCase()) && b.toLowerCase() !== value.toLowerCase()
  )
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        placeholder="e.g. Chihuahua"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-400"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {filtered.slice(0, 8).map(b => (
            <button key={b} type="button"
              onMouseDown={() => { onChange(b); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-sky-50 text-gray-700 border-b border-gray-50 last:border-0">
              {b}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface Pet {
  id: string
  name: string
  breed?: string
  vaccine_status: string
  photo_url?: string | null
}

// ─── Constants ────────────────────────────────────────────
const SERVICES = [
  {
    id: 'simply_cute',
    name: 'Simply Cute – Everyday Style',
    desc: 'Classic clean cut, bath, blow-dry & finishing touches',
    icon: '✂️',
    durationMinutes: 120,
  },
  {
    id: 'bath_brush',
    name: 'Bath & Brush',
    desc: 'Thorough bath, blow-dry & brush-out',
    icon: '🛁',
    durationMinutes: 120,
  },
  {
    id: 'asian_fusion',
    name: 'Asian Fusion Style',
    desc: 'Creative styling with a modern Asian-inspired look',
    icon: '🌸',
    durationMinutes: 180,
  },
]

const TIME_SLOTS = [
  '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
  '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM',
  '3:00 PM', '3:30 PM', '4:00 PM',
]

const TERMS_OF_SERVICE = `Kokoni Grooming Salon — Terms of Service

DISCLOSURE OF INFORMATION
Grooming can be stressful for a pet and infrequent grooming can be very traumatic for your pet. It is imperative that you share any known health issues, recent vet visits or history of groom issues so your stylist can watch for warning signs of trouble.

If you fail to disclose information about any allergies and/or skin conditions, Kokoni will not be held responsible for any irritation, patchiness, abrasions or hair loss that may arise due to the grooming process.

If you fail to disclose information regarding any physical and/or medical conditions (such as elbow or hip dysplasia, epilepsy etc.), Kokoni will not be held responsible for any injury incurred during the grooming process.

The client agrees that Kokoni, its owners and operators are not liable for any pre-existing conditions and problems found during grooming, and the pet owner agrees to pay for all medical treatment incurred due to such.

FLEAS & TICKS
If fleas and/or ticks are found on your pet during the process, treatment to remove your pet's fleas and/or ticks is mandatory, and an additional charge will apply at the owner's cost.

MATTED COAT & DE-MATTING
A "Dematting Fee" will apply to all matted pets. Removing a heavily matted coat includes risks of nicks, cuts or abrasions. As the pet's owner you agree that Kokoni shall not be held liable for any cuts/nicks/grazes or any post groom effects caused by removing a matted/neglected coat.

AGGRESSIVE PETS
Owner must inform your stylist if your pet(s) may bite, have bitten, or show signs of aggression. A handling fee may be applied for aggressive or difficult to groom pets. Kokoni reserves the right to refuse/stop services at any time.

LATE PICK UP
There will be a late pick up charge of $25 every 30 minutes if your pet is not picked up before our closing time of 5:00pm.

NO-SHOWS & CANCELLATIONS
No-shows and multiple last-minute cancellations are subject to a $30 no-show charge fee (per pet). Please give us 24 hours notice. Prepayment may be required before another appointment is booked.

VACCINATIONS
All pets must be up to date on all vaccinations including Rabies and either Distemper or Parvo Virus. You may upload records directly in this form, or email them to kokonipets@gmail.com

VISUAL RELEASE AND USE
All images, photos, and videos of the pet(s), taken during the stay in-store or during grooming, as well as their names, can be used by the Store in any form or format, for use in any media, marketing, advertising, or promotional materials.`

// ─── Availability helpers ─────────────────────────────────
function parseTimeMins(t: string): number {
  const [time, period] = t.split(' ')
  let [hours, minutes] = time.split(':').map(Number)
  if (period === 'PM' && hours !== 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0
  return hours * 60 + minutes
}

function formatTimeMins(mins: number): string {
  let hours = Math.floor(mins / 60)
  const minutes = mins % 60
  const period = hours >= 12 ? 'PM' : 'AM'
  if (hours > 12) hours -= 12
  if (hours === 0) hours = 12
  return `${hours}:${String(minutes).padStart(2, '0')} ${period}`
}

function generateTimeSlots(openTime: string, closeTime: string): string[] {
  const slots: string[] = []
  const start = parseTimeMins(openTime)
  const end = parseTimeMins(closeTime)
  for (let m = start; m < end; m += 15) slots.push(formatTimeMins(m))
  return slots
}

// ─── Helpers ──────────────────────────────────────────────
function formatPhone(val: string) {
  const digits = val.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
}

function formatDateShort(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
}

// ─── Progress Bar ─────────────────────────────────────────
const STEPS_ORDER: Step[] = ['phone', 'new-client', 'select-pet', 'service', 'datetime', 'vaccine-notes', 'tos', 'confirmed']
const STEPS_LABELS = ['Phone', 'Info', 'Pet', 'Service', 'Date & Time', 'Details', 'Terms', 'Done']

// ─── Main Component ───────────────────────────────────────
export default function BookPage() {
  const [step, setStep] = useState<Step>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Walk-in mode — reached via the kiosk's "Walk In" button (/book?walkin=1).
  // No time slot to pick: they're here now and will be seen right away, so the
  // whole "Pick a Date & Time" step is skipped and we book them for the current moment.
  const [isWalkIn, setIsWalkIn] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('walkin') === '1') {
      setIsWalkIn(true)
    }
  }, [])

  // Phone
  const [phone, setPhone] = useState('')
  const [smsConsentChecked, setSmsConsentChecked] = useState(false)

  // Client
  const [clientName, setClientName] = useState('')
  const [isNewClient, setIsNewClient] = useState(false)
  const [newClientFirstName, setNewClientFirstName] = useState('')
  const [newClientLastName, setNewClientLastName] = useState('')
  const [newClientName, setNewClientName] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')

  // Pets
  const [pets, setPets] = useState<Pet[]>([])
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null)
  const [isAddingNewPet, setIsAddingNewPet] = useState(false)
  const [newPetName, setNewPetName] = useState('')
  const [newPetBreed, setNewPetBreed] = useState('')
  const [newPetWeight, setNewPetWeight] = useState('')
  const [newPetBirthday, setNewPetBirthday] = useState('')
  const [uploadingPetPhotoId, setUploadingPetPhotoId] = useState<string | null>(null)
  const [uploadDonePetId, setUploadDonePetId] = useState<string | null>(null)
  const [newPetPhotoFile, setNewPetPhotoFile] = useState<File | null>(null)
  const [newPetPhotoPreview, setNewPetPhotoPreview] = useState<string | null>(null)

  // Service
  const [service, setService] = useState('')

  // Date/Time
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [calMonth, setCalMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState('')

  // Vaccine & Notes
  const [vaccineFile, setVaccineFile] = useState<File | null>(null)
  const [vaccineEmailOnly, setVaccineEmailOnly] = useState(false)
  const [vaccineSmsOnly, setVaccineSmsOnly] = useState(false)
  const [notes, setNotes] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ToS
  const [tosAgreed, setTosAgreed] = useState(false)
  const tosRef = useRef<HTMLDivElement>(null)

  // Confirmation
  const [appointmentId, setAppointmentId] = useState('')
  const [needsVaccineEmail, setNeedsVaccineEmail] = useState(false)
  const [vaccineContactMethod, setVaccineContactMethod] = useState<'email' | 'text' | null>(null)

  // Availability + services (fetched from admin settings)
  // Start with NO days bookable; the real open days load from settings. This
  // "fails closed" so a slow/failed settings fetch can't let someone book a day
  // the salon is actually closed (e.g. Saturday).
  const [allowedDays, setAllowedDays] = useState<number[]>([])
  const [blockedDates, setBlockedDates] = useState<string[]>([])
  const [dynamicTimeSlots, setDynamicTimeSlots] = useState<string[]>(TIME_SLOTS)
  const [openDaysLabel, setOpenDaysLabel] = useState('Monday – Saturday')
  const [dynamicServices, setDynamicServices] = useState(SERVICES)
  // Per-date slot availability (groomer capacity check)
  const [dateSlots, setDateSlots] = useState<string[] | null>(null)
  const [dateSlotsLoading, setDateSlotsLoading] = useState(false)
  const selectedDateRef = useRef<Date | null>(null)

  const fetchAvailability = useCallback(() => {
    fetch(`/api/availability?t=${Date.now()}`)
      .then(r => r.json())
      .then(data => {
        if (data.open_days) {
          setAllowedDays(data.open_days)
          const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          setOpenDaysLabel(data.open_days.map((d: number) => DAY_SHORT[d]).join(', '))
        }
        if (Array.isArray(data.blocked_dates)) setBlockedDates(data.blocked_dates)
        if (data.time_slots && data.time_slots.length > 0) setDynamicTimeSlots(data.time_slots)
        if (data.services && data.services.length > 0) {
          // Show ALL services from API (ignore visibility — admin controls this separately)
          // Merge in duration data from SERVICES constant
          const withDurations = data.services.map((s: any) => {
            const serviceDef = SERVICES.find(srv => srv.id === s.id)
            return { ...s, durationMinutes: serviceDef?.durationMinutes || 0 }
          })
          setDynamicServices(withDurations)
        }
      })
      .catch(() => {})
  }, [])

  const fetchDateSlots = useCallback((date: Date | null, forService?: string) => {
    if (!date) { setDateSlots(null); return }
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const dateStr = `${yyyy}-${mm}-${dd}`
    setDateSlotsLoading(true)
    setDateSlots(null)
    const svcParam = forService ? `&service=${encodeURIComponent(forService)}` : ''
    fetch(`/api/slots?date=${dateStr}${svcParam}&t=${Date.now()}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data.slots)) setDateSlots(data.slots) })
      .catch(() => {})
      .finally(() => setDateSlotsLoading(false))
  }, [])

  useEffect(() => {
    fetchAvailability()
    // Re-fetch everything when tab becomes visible again (e.g. after admin changes settings)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchAvailability()
        fetchDateSlots(selectedDateRef.current, service) // re-fetch slots for currently selected date
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchAvailability, fetchDateSlots, service])

  // Fetch capacity-aware slots whenever the selected date (or service) changes
  useEffect(() => {
    selectedDateRef.current = selectedDate
    fetchDateSlots(selectedDate, service)
  }, [selectedDate, service, fetchDateSlots])

  // ─── Step: Phone ────────────────────────────────────────
  const handlePhoneLookup = async () => {
    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 10) {
      setError('Please enter a valid 10-digit phone number.')
      return
    }
    // smsConsent is optional — do not block booking if unchecked
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/client?phone=${encodeURIComponent(digits)}`)
      const data = await res.json()
      if (data.found) {
        setClientName(data.client.name)
        setPets(data.pets || [])
        setIsNewClient(false)
        setStep('select-pet')
      } else {
        setIsNewClient(true)
        setStep('new-client')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ─── Step: New Client ───────────────────────────────────
  const handleNewClientContinue = () => {
    if (!newClientFirstName.trim()) { setError('Please enter your first name.'); return }
    if (!newPetName.trim()) { setError("Please enter your dog's name."); return }
    if (!newPetWeight) { setError("Please select your dog's weight."); return }
    setError('')
    const fullName = `${newClientFirstName.trim()} ${newClientLastName.trim()}`.trim()
    setNewClientName(fullName)
    setClientName(fullName)
    setStep('service')
  }

  // ─── Upload pet photo (existing pet) ────────────────────
  const uploadPetPhoto = async (petId: string, file: File) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
      setError('Please use a JPG, PNG, or WEBP photo.')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('Photo is too large (max 50 MB). Please choose a smaller file.')
      return
    }

    const localUrl = URL.createObjectURL(file)
    setPets(prev => prev.map(p => p.id === petId ? { ...p, photo_url: localUrl } : p))
    setSelectedPet(prev => prev?.id === petId ? { ...prev, photo_url: localUrl } : prev)

    setUploadingPetPhotoId(petId)
    try {
      // Compress via Canvas before uploading (keeps payload under Vercel's 4.5MB limit)
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
          canvas.width = width; canvas.height = height
          canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
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
        setSelectedPet(prev => prev?.id === petId ? { ...prev, photo_url: data.url } : prev)
        setUploadDonePetId(petId)
        setTimeout(() => setUploadDonePetId(null), 2000)
      } else {
        setError(data.error || 'Photo upload failed. Please try again.')
      }
    } catch {
      setError('Photo upload failed. Please try again.')
    } finally {
      setUploadingPetPhotoId(null)
    }
  }

  // ─── Step: Select Pet ───────────────────────────────────
  const handlePetContinue = () => {
    if (!selectedPet && !isAddingNewPet) { setError('Please select a dog or add a new one.'); return }
    if (isAddingNewPet && !newPetName.trim()) { setError("Please enter your dog's name."); return }
    if (isAddingNewPet && !newPetWeight) { setError("Please select your dog's weight."); return }
    setError('')
    setStep('service')
  }

  // ─── Step: Service ──────────────────────────────────────
  const handleServiceContinue = () => {
    if (!service) { setError('Please select a service.'); return }
    setError('')
    if (isWalkIn) {
      // Skip the calendar entirely — book for right now, in the salon's own timezone.
      const laParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date())
      const laGet = (t: string) => laParts.find(p => p.type === t)?.value ?? '00'
      const y = parseInt(laGet('year')), mo = parseInt(laGet('month')), d = parseInt(laGet('day'))
      const h24 = parseInt(laGet('hour')), min = parseInt(laGet('minute'))
      setSelectedDate(new Date(y, mo - 1, d))
      const period = h24 >= 12 ? 'PM' : 'AM'
      const h12 = h24 % 12 || 12
      setSelectedTime(`${h12}:${String(min).padStart(2, '0')} ${period}`)
      setStep('vaccine-notes')
      return
    }
    setStep('datetime')
  }

  // ─── Step: DateTime ─────────────────────────────────────
  const handleDateTimeContinue = () => {
    if (!selectedDate) { setError('Please select a date.'); return }
    if (!selectedTime) { setError('Please select a time.'); return }
    setError('')
    setStep('vaccine-notes')
  }

  // ─── Step: Vaccine & Notes ──────────────────────────────
  const handleVaccineContinue = () => {
    const petNeedsVaccine = isNewClient || isAddingNewPet ||
      (selectedPet && selectedPet.vaccine_status === 'pending')
    if (petNeedsVaccine && !vaccineFile && !vaccineEmailOnly && !vaccineSmsOnly) {
      setError('Please upload your vaccination records or choose to email/text them.')
      return
    }
    setError('')
    setStep('tos')
  }

  // ─── Step: Submit ───────────────────────────────────────
  const handleSubmit = async () => {
    if (!tosAgreed) { setError('Please agree to the Terms of Service.'); return }
    setError('')
    setLoading(true)

    try {
      const digits = phone.replace(/\D/g, '')
      const payload: Record<string, unknown> = {
        phone: digits,
        service,
        date: formatDateShort(selectedDate!),
        time: selectedTime,
        notes,
        tosAgreedAt: new Date().toISOString(),
        smsConsent: smsConsentChecked,
        smsConsentAt: smsConsentChecked ? new Date().toISOString() : null,
        isWalkIn,
      }

      // New client → create client + pet
      if (isNewClient) {
        payload.isNewClient = true
        payload.clientName = newClientName.trim()
        payload.clientEmail = newClientEmail.trim()
        payload.petName = newPetName.trim()
        payload.petBreed = newPetBreed.trim()
        payload.petWeight = newPetWeight
        payload.petBirthday = newPetBirthday || null
      } else if (isAddingNewPet) {
        payload.isNewPet = true
        payload.petName = newPetName.trim()
        payload.petBreed = newPetBreed.trim()
        payload.petWeight = newPetWeight
        payload.petBirthday = newPetBirthday || null
      } else {
        payload.petId = selectedPet!.id
      }

      // Upload vaccine file if provided
      if (vaccineFile) {
        const formData = new FormData()
        formData.append('file', vaccineFile)
        formData.append('phone', digits)
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData })
        const uploadData = await uploadRes.json()
        if (uploadData.url) payload.vaccineFileUrl = uploadData.url
      }

      payload.vaccineEmailOnly = vaccineEmailOnly
      payload.vaccineSmsOnly = vaccineSmsOnly

      // Create appointment
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Booking failed')

      // Upload new pet photo if provided (Canvas-compressed to stay under Vercel's 4.5MB limit)
      if (newPetPhotoFile && data.petId) {
        try {
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
              canvas.width = width; canvas.height = height
              canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
              resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1])
            }
            img.onerror = reject
            img.src = URL.createObjectURL(newPetPhotoFile)
          })
          await fetch('/api/pets/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ petId: data.petId, fileBase64: base64, contentType: 'image/jpeg', ext: 'jpg' }),
          })
        } catch { /* photo upload failure shouldn't block booking */ }
      }

      setAppointmentId(data.id)
      setNeedsVaccineEmail(vaccineEmailOnly || vaccineSmsOnly)
      setVaccineContactMethod(vaccineSmsOnly ? 'text' : vaccineEmailOnly ? 'email' : null)
      setStep('confirmed')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ─── Calendar ───────────────────────────────────────────
  const prevMonth = () => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))
  const nextMonth = () => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))

  const renderCalendar = () => {
    const year = calMonth.getFullYear()
    const month = calMonth.getMonth()
    const totalDays = daysInMonth(year, month)
    const firstDay = firstDayOfMonth(year, month)
    const cells: (number | null)[] = Array(firstDay).fill(null)
    for (let d = 1; d <= totalDays; d++) cells.push(d)

    const monthName = calMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' })

    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-2 rounded-full hover:bg-sky-100 transition-colors">
            <ChevronLeft className="w-5 h-5 text-sky-700" />
          </button>
          <span className="font-semibold text-sky-900">{monthName}</span>
          <button onClick={nextMonth} className="p-2 rounded-full hover:bg-sky-100 transition-colors">
            <ChevronRight className="w-5 h-5 text-sky-700" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center mb-2">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
            <div key={d} className="text-xs font-medium text-gray-400 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {cells.map((day, idx) => {
            if (!day) return <div key={idx} />
            const date = new Date(year, month, day)
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const isToday = date.toDateString() === today.toDateString()
            const isPast = !isToday && date < today   // today is never "past"
            const isClosed = !allowedDays.includes(date.getDay())
            const isBlockedDate = !isToday && blockedDates.includes(dateStr) // today can't be blocked
            const isDisabled = isPast || isClosed || isBlockedDate
            const isSelected = selectedDate?.toDateString() === date.toDateString()

            return (
              <button
                key={idx}
                disabled={isDisabled}
                onClick={() => { setSelectedDate(date); setSelectedTime('') }}
                className={`
                  rounded-full w-9 h-9 text-sm font-medium mx-auto flex items-center justify-center transition-all relative cursor-pointer
                  ${isSelected ? 'bg-sky-600 text-white shadow-md' : ''}
                  ${!isSelected && isToday ? 'border-2 border-sky-500 text-sky-700 hover:bg-sky-100' : ''}
                  ${!isSelected && !isToday && !isDisabled ? 'hover:bg-sky-100 text-gray-800' : ''}
                  ${isDisabled ? 'text-gray-300 cursor-not-allowed' : ''}
                `}
                title={isToday ? 'Today' : isBlockedDate ? 'Not available' : isClosed ? 'Closed' : ''}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ─── Progress Indicator ─────────────────────────────────
  const stepIdx = STEPS_ORDER.indexOf(step)
  const totalSteps = STEPS_ORDER.length - 1 // exclude confirmed

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-sky-50 flex flex-col items-center justify-start py-8 px-4">
      {/* Header */}
      <div className="flex flex-col items-center mb-6">
        <Image
          src="/logo.png"
          alt="Kokoni Pet Grooming Salon"
          width={160}
          height={120}
          className="object-contain mb-1"
          priority
        />
        <p className="text-sm text-sky-600 font-medium">Book Online</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-gray-400">Language:</span>
          <span className="text-xs font-semibold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">English</span>
          <a href={`/book-zh-tw${isWalkIn ? '?walkin=1' : ''}`} className="text-xs text-gray-500 hover:text-sky-600 px-2 py-0.5 rounded-full hover:bg-sky-50 transition-colors">繁體中文</a>
          <a href={`/book-zh-cn${isWalkIn ? '?walkin=1' : ''}`} className="text-xs text-gray-500 hover:text-sky-600 px-2 py-0.5 rounded-full hover:bg-sky-50 transition-colors">简体中文</a>
        </div>
      </div>

      {/* Progress bar (hidden on confirmed) */}
      {step !== 'confirmed' && (
        <div className="w-full max-w-md mb-6">
          <div className="flex items-center gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-all ${i < stepIdx ? 'bg-sky-500' : i === stepIdx ? 'bg-sky-700' : 'bg-gray-200'}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">

        {/* ── STEP: PHONE ── */}
        {step === 'phone' && (
          <div className="p-6">
            <h2 className="text-xl font-bold text-sky-900 mb-1">Request an Appointment</h2>
            <p className="text-sm text-gray-500 mb-6">Enter your phone number to get started</p>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Phone className="w-4 h-4 inline mr-1 text-sky-600" />
              Phone Number
            </label>
            <input
              type="tel"
              placeholder="(949) 000-0000"
              value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && handlePhoneLookup()}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg tracking-wide focus:outline-none focus:ring-2 focus:ring-sky-400 mb-4"
            />
            {/* SMS Opt-In (optional — A2P 10DLC compliant: consent is not a condition of booking) */}
            <div className="mt-4 p-3 bg-sky-50 border border-sky-100 rounded-xl">
              <p className="text-xs text-gray-600 leading-relaxed">
                <strong>Optional:</strong> Check the box below to receive appointment confirmations, reminders, and pickup notifications via text message from <strong>Kokoni Pet Grooming Salon</strong> at the phone number provided. Message frequency varies (approximately 2–5 messages per booking). Msg &amp; data rates may apply. Reply <strong>STOP</strong> to opt out, <strong>HELP</strong> for help. See our{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-sky-600 underline hover:text-sky-700">
                  Privacy Policy
                </a>{' '}
                and{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-sky-600 underline hover:text-sky-700">
                  Terms of Service
                </a>.{' '}
                <strong>Consent is not required to book an appointment.</strong>
              </p>
            </div>

            {/* SMS Opt-In Checkbox (voluntary — unchecked by default) */}
            <label className="flex items-start gap-3 mt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={smsConsentChecked}
                onChange={e => setSmsConsentChecked(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-sky-600 cursor-pointer flex-shrink-0"
              />
              <span className="text-xs text-gray-700 leading-relaxed">
                <strong>(Optional)</strong> I agree to receive SMS appointment notifications from Kokoni Pet Grooming Salon as described above.
              </span>
            </label>

            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <button
              onClick={handlePhoneLookup}
              disabled={loading}
              className="w-full mt-4 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Looking up...' : 'Continue'}
            </button>

            <div className="mt-4 pt-4 border-t border-gray-100 text-center">
              <a href="/profile" className="text-sm text-sky-600 hover:underline">
                👤 View my profile & appointments →
              </a>
            </div>
          </div>
        )}

        {/* ── STEP: NEW CLIENT ── */}
        {step === 'new-client' && (
          <div className="p-6">
            <button onClick={() => setStep('phone')} className="flex items-center text-sky-600 text-sm mb-4 hover:underline">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <h2 className="text-xl font-bold text-sky-900 mb-1">Welcome! Let&apos;s get you set up</h2>
            <p className="text-sm text-gray-500 mb-5">First time here? We&apos;d love to meet you!</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Name *</label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="First name"
                    value={newClientFirstName}
                    onChange={e => setNewClientFirstName(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                  <input
                    type="text"
                    placeholder="Last name"
                    value={newClientLastName}
                    onChange={e => setNewClientLastName(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-gray-400">(optional)</span></label>
                <input
                  type="email"
                  placeholder="you@email.com"
                  value={newClientEmail}
                  onChange={e => setNewClientEmail(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
              </div>
              <hr className="border-gray-100" />
              <p className="text-sm font-semibold text-sky-800">🐾 Your Dog</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dog&apos;s Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Peanut"
                  value={newPetName}
                  onChange={e => setNewPetName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Breed <span className="text-gray-400">(optional)</span></label>
                <BreedInput value={newPetBreed} onChange={setNewPetBreed} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Weight <span className="text-rose-500">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {['Small (under 15 lbs)', 'Medium (16–30 lbs)', 'Large (31–50 lbs)', 'XL (51–70 lbs)'].map(w => (
                    <button key={w} type="button" onClick={() => setNewPetWeight(newPetWeight === w ? '' : w)}
                      className={`py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${newPetWeight === w ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 text-gray-600 hover:border-sky-300'}`}>
                      {w}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Birthday <span className="text-gray-400">(optional)</span></label>
                <input
                  type="date"
                  value={newPetBirthday}
                  onChange={(e) => setNewPetBirthday(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <button
              onClick={handleNewClientContinue}
              className="w-full mt-6 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* ── STEP: SELECT PET ── */}
        {step === 'select-pet' && (
          <div className="p-6">
            <button onClick={() => setStep('phone')} className="flex items-center text-sky-600 text-sm mb-4 hover:underline">
              ← Back
            </button>
            <h2 className="text-xl font-bold text-sky-900 mb-1">Hello{clientName && !/^\d+$/.test(clientName.trim()) ? `, ${clientName.split(' ')[0]}` : ''}! 👋</h2>
            <p className="text-sm text-gray-500 mb-5">Which dog is coming in today?</p>

            <div className="space-y-3">
              {pets.map(pet => (
                <div key={pet.id} className={`rounded-xl border-2 transition-all ${selectedPet?.id === pet.id && !isAddingNewPet ? 'border-sky-500 bg-sky-50' : 'border-gray-100'}`}>
                  <button
                    onClick={() => { setSelectedPet(pet); setIsAddingNewPet(false) }}
                    className="w-full flex items-center gap-4 p-4 text-left"
                  >
                    {/* Pet photo */}
                    {pet.photo_url ? (
                      <img src={pet.photo_url} alt={pet.name} className="w-12 h-12 rounded-full object-cover border-2 border-sky-100 shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center text-2xl shrink-0">🐶</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800">{pet.name}</p>
                      {pet.breed && <p className="text-sm text-gray-400">{pet.breed}</p>}
                    </div>
                    {selectedPet?.id === pet.id && !isAddingNewPet && (
                      <CheckCircle2 className="w-5 h-5 text-sky-500 shrink-0" />
                    )}
                  </button>

                  {/* Photo upload row — shown when this pet is selected */}
                  {selectedPet?.id === pet.id && !isAddingNewPet && (
                    <div className="px-4 pb-3 flex items-center gap-2 border-t border-sky-100">
                      <label className={`flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                        uploadingPetPhotoId === pet.id ? 'bg-sky-400' :
                        uploadDonePetId === pet.id ? 'bg-green-500' :
                        'bg-sky-500 hover:bg-sky-600'
                      }`}>
                        {uploadingPetPhotoId === pet.id ? (
                          <>
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                            </svg>
                            Uploading...
                          </>
                        ) : uploadDonePetId === pet.id ? (
                          <>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                            </svg>
                            Done!
                          </>
                        ) : (
                          '📷 Update Photo'
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingPetPhotoId === pet.id}
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) uploadPetPhoto(pet.id, file)
                          }}
                        />
                      </label>
                      <span className="text-xs text-gray-400">{pet.photo_url ? 'Change photo' : 'Add a photo'}</span>
                    </div>
                  )}
                </div>
              ))}

              {/* Add new pet */}
              <button
                onClick={() => { setIsAddingNewPet(true); setSelectedPet(null) }}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${isAddingNewPet ? 'border-sky-500 bg-sky-50' : 'border-dashed border-gray-200 hover:border-sky-300'}`}
              >
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl">➕</div>
                <p className="font-medium text-gray-600">Add a new dog</p>
                {isAddingNewPet && <CheckCircle2 className="w-5 h-5 text-sky-500 ml-auto" />}
              </button>
            </div>

            {isAddingNewPet && (
              <div className="mt-4 space-y-3">
                <input
                  type="text"
                  placeholder="Dog's name *"
                  value={newPetName}
                  onChange={e => setNewPetName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
                <BreedInput value={newPetBreed} onChange={setNewPetBreed} />
                {/* Weight selector */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Weight <span className="text-rose-500">*</span></p>
                  <div className="grid grid-cols-2 gap-2">
                    {['Small (under 15 lbs)', 'Medium (16–30 lbs)', 'Large (31–50 lbs)', 'XL (51–70 lbs)'].map(w => (
                      <button key={w} type="button" onClick={() => setNewPetWeight(newPetWeight === w ? '' : w)}
                        className={`py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${newPetWeight === w ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 text-gray-600 hover:border-sky-300'}`}>
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Birthday */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Birthday <span className="text-gray-400">(optional)</span></p>
                  <input
                    type="date"
                    value={newPetBirthday}
                    onChange={(e) => setNewPetBirthday(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                </div>
                {/* Photo upload for new pet */}
                <label className="flex items-center gap-3 p-3 border border-dashed border-sky-300 rounded-xl cursor-pointer hover:bg-sky-50 transition-colors">
                  {newPetPhotoPreview ? (
                    <img src={newPetPhotoPreview} alt="preview" className="w-12 h-12 rounded-full object-cover border-2 border-sky-200" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center text-2xl">📷</div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-sky-600">{newPetPhotoFile ? newPetPhotoFile.name : 'Add a photo (optional)'}</p>
                    <p className="text-xs text-gray-400">Tap to choose a photo of your dog</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setNewPetPhotoFile(file)
                        setNewPetPhotoPreview(URL.createObjectURL(file))
                      }
                    }}
                  />
                </label>
              </div>
            )}

            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <button
              onClick={handlePetContinue}
              className="w-full mt-6 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* ── STEP: SERVICE ── */}
        {step === 'service' && (
          <div className="p-6">
            <button onClick={() => setStep(isNewClient ? 'new-client' : 'select-pet')} className="flex items-center text-sky-600 text-sm mb-4 hover:underline">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <h2 className="text-xl font-bold text-sky-900 mb-1">
              <Scissors className="w-5 h-5 inline mr-2 text-sky-600" />
              Select a Service
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              For {isNewClient ? newPetName : (isAddingNewPet ? newPetName : selectedPet?.name)}
            </p>

            {isWalkIn && (
              <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-center">
                <p className="text-sm font-semibold text-amber-800">🚶 Walk-In — No appointment time needed</p>
                <p className="text-xs text-amber-700 mt-0.5">Pick a service and we'll see you right away.</p>
              </div>
            )}

            <div className="space-y-4">
              {(() => {
                // Group by service type using keyword matching
                const grouped: Record<string, any[]> = { 'Bath & Brush': [], 'Simply Cute': [], 'Asian Fusion': [], 'Other': [] }
                dynamicServices.forEach(s => {
                  if (!s.visible && s.visible !== undefined) return // skip hidden services
                  // Walk-in mode only offers services flagged "⚡ Walk-in Anytime" in Settings —
                  // those are the quick ones that don't need a real time slot.
                  if (isWalkIn && !s.skipCapacity) return
                  const n = s.name.toLowerCase()
                  if (n.includes('bath') || n.includes('brush')) grouped['Bath & Brush'].push(s)
                  else if (n.includes('simply') || n.includes('cute')) grouped['Simply Cute'].push(s)
                  else if (n.includes('asian') || n.includes('fusion')) grouped['Asian Fusion'].push(s)
                  else grouped['Other'].push(s) // catch-all so new services still show up
                })
                // Define order: Bath & Brush first, then Simply Cute, then Asian Fusion, then anything else
                const order = ['Bath & Brush', 'Simply Cute', 'Asian Fusion', 'Other']
                const serviceButton = (s: any) => (
                  <button
                    key={s.id}
                    onClick={() => setService(s.id)}
                    className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left group ${service === s.id ? 'border-sky-500 bg-sky-50' : 'border-gray-100 hover:border-sky-200'}`}
                  >
                    <span className="text-2xl mt-0.5">{s.icon}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-800">
                        {s.name.includes('-') ? (
                          <>
                            {s.name.split('-')[0].trim()}
                            <span className="text-sky-400 ml-1">-{s.name.split('-')[1]}</span>
                          </>
                        ) : s.name.includes('$') ? (
                          <>
                            {s.name.split('$')[0].trim()}
                            <span className="text-sky-400 ml-1">${s.name.split('$')[1].trim()}</span>
                          </>
                        ) : (
                          s.name
                        )}
                      </p>
                      <p className="text-sm text-gray-400 mt-0.5 max-h-0 overflow-hidden group-hover:max-h-20 transition-all duration-200">{s.desc}</p>
                    </div>
                    {service === s.id && <CheckCircle2 className="w-5 h-5 text-sky-500 mt-1" />}
                  </button>
                )
                const buttons = order.flatMap(groupName =>
                  (grouped[groupName] || []).map(serviceButton)
                )
                if (isWalkIn && buttons.length === 0) {
                  return (
                    <p className="text-sm text-gray-400 text-center py-6">
                      No walk-in services are set up yet. Please check in with the front desk.
                    </p>
                  )
                }
                return buttons
              })()}
            </div>

            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <button
              onClick={handleServiceContinue}
              className="w-full mt-6 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* ── STEP: DATE & TIME ── */}
        {step === 'datetime' && (
          <div className="p-6">
            <button onClick={() => setStep('service')} className="flex items-center text-sky-600 text-sm mb-4 hover:underline">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <h2 className="text-xl font-bold text-sky-900 mb-1">
              <Calendar className="w-5 h-5 inline mr-2 text-sky-600" />
              Pick a Date & Time
            </h2>
            <p className="text-sm text-gray-500 mb-5">We are open {openDaysLabel}</p>

            {renderCalendar()}

            {selectedDate && (
              <div className="mt-6">
                <p className="text-sm font-semibold text-sky-800 mb-1 flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Available Times — {formatDate(selectedDate)}
                </p>
                <p className="text-xs text-gray-500 mb-3">🕒 All times are in Pacific Time (Los Angeles).</p>
                {dateSlotsLoading ? (
                  <p className="text-sm text-gray-400 text-center py-4">Checking availability…</p>
                ) : (() => {
                  // Use the salon's timezone (Pacific/LA) for "today" + current time,
                  // so customers booking from other timezones see the correct available slots.
                  const laParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date())
                  const laGet = (t: string) => laParts.find(p => p.type === t)?.value ?? '00'
                  const laTodayStr = `${laGet('year')}-${laGet('month')}-${laGet('day')}`
                  const selStr = selectedDate ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}` : ''
                  const isSelectedToday = selStr === laTodayStr
                  const nowMins = isSelectedToday ? parseInt(laGet('hour')) * 60 + parseInt(laGet('minute')) : -1
                  // Use capacity-aware slots from /api/slots if loaded, else fall back to dynamicTimeSlots
                  const baseSlots = dateSlots ?? dynamicTimeSlots

                  // Get selected service duration (need 30 min cleanup, so appointments finish by 4:30 PM = 16:30 = 990 mins)
                  const selectedServiceObj = dynamicServices.find(s => s.id === service)
                  const serviceDuration = selectedServiceObj?.durationMinutes || 0
                  const closingTimeMins = 16 * 60 + 30 // 4:30 PM (with 30 min cleanup buffer)

                  const availableSlots = baseSlots.filter(t => {
                    // Filter out past times if selected date is today
                    if (isSelectedToday && parseTimeMins(t) <= nowMins) return false
                    // Filter out times that would end after closing (5 PM)
                    const slotEndTime = parseTimeMins(t) + serviceDuration
                    return slotEndTime <= closingTimeMins
                  })
                  return availableSlots.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {availableSlots.map(t => (
                        <button
                          key={t}
                          onClick={() => setSelectedTime(t)}
                          className={`py-2 rounded-xl text-sm font-medium border-2 transition-all ${selectedTime === t ? 'bg-sky-600 text-white border-sky-600' : 'border-gray-100 hover:border-sky-300 text-gray-700'}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-3">No available slots — all groomers are fully booked. Please pick another date.</p>
                  )
                })()}
              </div>
            )}

            {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
            <button
              onClick={handleDateTimeContinue}
              disabled={!selectedDate || !selectedTime}
              className="w-full mt-6 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        )}

        {/* ── STEP: VACCINE & NOTES ── */}
        {step === 'vaccine-notes' && (
          <div className="p-6">
            <button onClick={() => setStep(isWalkIn ? 'service' : 'datetime')} className="flex items-center text-sky-600 text-sm mb-4 hover:underline">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <h2 className="text-xl font-bold text-sky-900 mb-1">Vaccination & Notes</h2>
            <p className="text-sm text-gray-500 mb-5">Required for new dogs</p>

            {/* Vaccine section — only shown for new pets */}
            {(isNewClient || isAddingNewPet || (selectedPet && selectedPet.vaccine_status === 'pending')) && (
              <div className="mb-6">
                <p className="text-sm font-semibold text-sky-800 mb-1">💉 Vaccination Records</p>
                <p className="text-xs text-gray-500 mb-3">
                  Required: <strong>Rabies</strong> + <strong>Distemper</strong> or <strong>Parvo Virus</strong>
                </p>

                <div className="space-y-3">
                  {/* Upload option */}
                  <div
                    className={`upload-zone rounded-xl p-4 text-center cursor-pointer transition-all ${vaccineFile ? 'bg-green-50 border-green-400' : ''} ${vaccineEmailOnly || vaccineSmsOnly ? 'opacity-40 pointer-events-none' : ''}`}
                    onClick={() => !vaccineEmailOnly && !vaccineSmsOnly && fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept="image/*,.pdf"
                      onChange={e => {
                        if (e.target.files?.[0]) {
                          setVaccineFile(e.target.files[0])
                          setVaccineEmailOnly(false)
                        }
                      }}
                    />
                    {vaccineFile ? (
                      <div className="flex items-center justify-center gap-2 text-green-700">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="text-sm font-medium">{vaccineFile.name}</span>
                      </div>
                    ) : (
                      <div>
                        <Upload className="w-6 h-6 text-sky-500 mx-auto mb-1" />
                        <p className="text-sm font-medium text-sky-700">Upload vaccination records</p>
                        <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, or PDF</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400">or</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>

                  {/* Email option */}
                  <button
                    onClick={() => { setVaccineEmailOnly(!vaccineEmailOnly); setVaccineSmsOnly(false); setVaccineFile(null) }}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${vaccineEmailOnly ? 'border-sky-500 bg-sky-50' : 'border-gray-100 hover:border-sky-200'}`}
                  >
                    <Mail className="w-5 h-5 text-sky-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">I&apos;ll email my records</p>
                      <p className="text-xs text-gray-400 mt-0.5">kokonipets@gmail.com</p>
                    </div>
                    {vaccineEmailOnly && <CheckCircle2 className="w-5 h-5 text-sky-500 ml-auto" />}
                  </button>

                  {/* Text option */}
                  <button
                    onClick={() => { setVaccineSmsOnly(!vaccineSmsOnly); setVaccineEmailOnly(false); setVaccineFile(null) }}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${vaccineSmsOnly ? 'border-sky-500 bg-sky-50' : 'border-gray-100 hover:border-sky-200'}`}
                  >
                    <Phone className="w-5 h-5 text-sky-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">I&apos;ll text my records</p>
                      <p className="text-xs text-gray-400 mt-0.5">(626) 621-4646</p>
                    </div>
                    {vaccineSmsOnly && <CheckCircle2 className="w-5 h-5 text-sky-500 ml-auto" />}
                  </button>
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-semibold text-sky-800 mb-2">
                Special Notes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                placeholder="e.g. Peanut is nervous around other dogs, please use low speed dryer..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
              />
            </div>

            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <button
              onClick={handleVaccineContinue}
              className="w-full mt-6 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* ── STEP: TERMS OF SERVICE ── */}
        {step === 'tos' && (
          <div className="p-6">
            <button onClick={() => setStep('vaccine-notes')} className="flex items-center text-sky-600 text-sm mb-4 hover:underline">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <h2 className="text-xl font-bold text-sky-900 mb-1">Terms of Service</h2>
            <p className="text-sm text-gray-500 mb-4">Please read before submitting your request</p>

            {/* Appointment summary */}
            <div className="bg-sky-50 rounded-xl p-4 mb-4 text-sm space-y-1">
              <p className="font-semibold text-sky-800">Appointment Summary</p>
              <p className="text-gray-600">🐾 {isNewClient || isAddingNewPet ? newPetName : selectedPet?.name}</p>
              <p className="text-gray-600">✂️ {dynamicServices.find(s => s.id === service)?.name}</p>
              <p className="text-gray-600">📅 {isWalkIn ? 'Right now (walk-in)' : `${selectedDate ? formatDate(selectedDate) : ''} @ ${selectedTime}`}</p>
            </div>

            {/* ToS scroll box */}
            <div
              ref={tosRef}
              className="tos-scroll h-52 overflow-y-auto border border-gray-200 rounded-xl p-4 text-xs text-gray-600 leading-relaxed bg-gray-50"
              onScroll={e => {
                const el = e.currentTarget
                if (el.scrollHeight - el.scrollTop <= el.clientHeight + 20) {
                  // scrolled to bottom
                }
              }}
            >
              {TERMS_OF_SERVICE.split('\n').map((line, i) => (
                <p key={i} className={line === line.toUpperCase() && line.trim() ? 'font-bold text-gray-800 mt-3 mb-1' : 'mb-1'}>
                  {line || '\u00A0'}
                </p>
              ))}
            </div>

            {/* Agree to Terms of Service (required) */}
            <label className="flex items-start gap-3 mt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={tosAgreed}
                onChange={e => setTosAgreed(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-sky-600 cursor-pointer flex-shrink-0"
              />
              <span className="text-sm text-gray-700">
                I have read and agree to the <strong>Terms of Service</strong>.
              </span>
            </label>

            {/* SMS Consent (optional) */}
            <label className="flex items-start gap-3 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={smsConsentChecked}
                onChange={e => setSmsConsentChecked(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-sky-600 cursor-pointer flex-shrink-0"
              />
              <span className="text-sm text-gray-700">
                <strong>(Optional)</strong> I agree to receive appointment-related text messages from Kokoni Pet Grooming Salon at the phone number provided. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help. Consent is not required to book an appointment.
              </span>
            </label>

            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <button
              onClick={handleSubmit}
              disabled={!tosAgreed || loading}
              className="w-full mt-5 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        )}

        {/* ── STEP: CONFIRMED ── */}
        {step === 'confirmed' && (
          <div className="p-6 text-center">
            {/* Status icon */}
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">
              📋
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-gray-900 mb-1">{isWalkIn ? "You're All Set!" : 'Request Received!'}</h2>

            {/* NOT confirmed callout (scheduled bookings only — walk-ins are seen right away, no approval step) */}
            {isWalkIn ? (
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl px-5 py-4 mb-5 mt-3">
                <p className="text-emerald-800 font-bold text-base">🚶 You're checked in as a walk-in.</p>
                <p className="text-emerald-700 text-sm mt-1">Please have a seat — we&apos;ll be right with you.</p>
              </div>
            ) : (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-5 py-4 mb-5 mt-3">
                <p className="text-amber-800 font-bold text-base">⚠️ Your appointment is not confirmed yet.</p>
                <p className="text-amber-700 text-sm mt-1">
                  We&apos;ll review your request and send you a <strong>text message</strong> once it&apos;s approved.
                </p>
              </div>
            )}

            {/* Request summary */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm text-left mb-4 space-y-2">
              <p className="font-semibold text-gray-700 mb-1">📝 Your Request</p>
              <div className="flex items-center gap-2 text-gray-600">
                <span>🐾</span>
                <span>{isNewClient || isAddingNewPet ? newPetName : selectedPet?.name}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <span>✂️</span>
                <span>{dynamicServices.find(s => s.id === service)?.name}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <span>📅</span>
                <span>{isWalkIn ? 'Right now (walk-in)' : `${selectedDate ? formatDate(selectedDate) : ''} @ ${selectedTime}`}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <span>📱</span>
                <span>{phone}</span>
              </div>
            </div>

            {/* Vaccine action required */}
            {needsVaccineEmail && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-800 mb-4 text-left">
                <p className="font-semibold mb-1">{vaccineContactMethod === 'text' ? '📱' : '📧'} Action Required</p>
                <p className="text-rose-700">
                  Please {vaccineContactMethod === 'text' ? 'text' : 'email'} your vaccination records (Rabies + Distemper or Parvo Virus) to:
                </p>
                <p className="font-mono font-bold mt-1 text-rose-900">
                  {vaccineContactMethod === 'text' ? '(626) 621-4646' : 'kokonipets@gmail.com'}
                </p>
                <p className="text-xs mt-1.5 text-rose-600">Your appointment cannot be confirmed until we receive your records.</p>
              </div>
            )}

            {/* What happens next */}
            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-sm text-left mb-4">
              <p className="font-semibold text-sky-800 mb-2">💬 What happens next?</p>
              <ol className="space-y-1.5 text-sky-700 list-none">
                <li className="flex items-start gap-2"><span className="font-bold">1.</span><span>We review your request (usually same day)</span></li>
                <li className="flex items-start gap-2"><span className="font-bold">2.</span><span>You&apos;ll receive a <strong>text message</strong> confirming your appointment</span></li>
                <li className="flex items-start gap-2"><span className="font-bold">3.</span><span>Once confirmed, your appointment is set! 🎉</span></li>
              </ol>
            </div>

            {/* Cancellation policy only */}
            <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-400 mb-4">
              Please give us 24 hours notice to avoid a $30 no-show / cancellation fee.
            </div>

            <a
              href="/profile"
              className="block text-sm text-sky-600 hover:underline font-medium"
            >
              👤 View or update my profile →
            </a>

            <p className="text-xs text-gray-400 mt-3">
              Kokoni Pet Grooming Salon • (626) 621-4646
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-6 text-center">
        Kokoni Pet Grooming Salon • (626) 621-4646
      </p>
    </div>
  )
}
