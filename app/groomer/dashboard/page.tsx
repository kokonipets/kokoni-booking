'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { TagPill, TagPicker, type Tag as PetTag } from '@/lib/tags'
import { readAuthRaw, clearAuth } from '@/lib/authStorage'

type Appointment = {
  id: string
  client_phone: string
  service: string
  appointment_date: string
  appointment_time: string
  status: string
  grooming_status: string | null
  groomer_confirmed?: boolean | null
  created_at?: string | null
  confirmed_at?: string | null
  assigned_groomer: string | null
  assigned_bather: string | null
  clients: { name: string; phone: string; email: string | null } | null
  pets: { id?: string; name: string; breed: string | null; weight: string | null; photo_url: string | null } | null
  notes_list?: { id: string; text: string; author?: string; price?: string; is_addon?: boolean }[] | null
  notes?: string | null
  payment_amount?: string | null
  size_tier?: string | null
  payment_method?: string | null
  payment_status?: string | null
  tip_amount?: string | null
  checked_in_at?: string | null
  grooming_started_at?: string | null
  grooming_finished_at?: string | null
}

type AuthUser = {
  id: string
  staff_id: string
  name: string
  role: string
  email: string
  pay_type?: 'hourly' | 'salary'
  hourly_rate?: number
  commission_percent?: number
  tip_percent?: number
  permissions?: Record<string, boolean>
}

type NavKey = 'today' | 'pending' | 'calendar' | 'earnings'

const TIME_OPTIONS = [
  '7:00 AM', '7:15 AM', '7:30 AM', '7:45 AM',
  '8:00 AM', '8:15 AM', '8:30 AM', '8:45 AM',
  '9:00 AM', '9:15 AM', '9:30 AM', '9:45 AM',
  '10:00 AM', '10:15 AM', '10:30 AM', '10:45 AM',
  '11:00 AM', '11:15 AM', '11:30 AM', '11:45 AM',
  '12:00 PM', '12:15 PM', '12:30 PM', '12:45 PM',
  '1:00 PM', '1:15 PM', '1:30 PM', '1:45 PM',
  '2:00 PM', '2:15 PM', '2:30 PM', '2:45 PM',
  '3:00 PM', '3:15 PM', '3:30 PM', '3:45 PM',
  '4:00 PM', '4:15 PM', '4:30 PM', '4:45 PM',
  '5:00 PM', '5:15 PM', '5:30 PM', '5:45 PM',
  '6:00 PM', '6:15 PM', '6:30 PM', '6:45 PM',
  '7:00 PM', '7:15 PM', '7:30 PM', '7:45 PM',
  '8:00 PM',
]

const WEIGHT_OPTIONS = ['Small (under 15 lbs)', 'Medium (10-25 lbs)', 'Large (25-60 lbs)', 'XLarge (60+ lbs)']

// ─── Quality Check Config (Bilingual EN / ZH) ─────────────────────────────
const QUALITY_CHECK_ITEMS = [
  { key: 'nails_trimmed',   emoji: '✂️',  en: 'Nails Trimmed',   zh: '剪指甲' },
  { key: 'ears_cleaned',    emoji: '👂',  en: 'Ears Cleaned',    zh: '清耳朵' },
  { key: 'tangles_free',    emoji: '🪮',  en: 'Tangles Free',    zh: '無毛結' },
  { key: 'sanitary_trim',   emoji: '🧼',  en: 'Sanitary Trim',   zh: '衛生修剪' },
  { key: 'paw_pad_trim',    emoji: '🐾',  en: 'Paw Pad Trim',    zh: '腳掌修剪' },
  { key: 'perfume_spray',   emoji: '🌸',  en: 'Perfume Spray',   zh: '噴香水' },
] as const
type QualityCheckKey = typeof QUALITY_CHECK_ITEMS[number]['key']
const EMPTY_QUALITY_CHECKS = (): Record<QualityCheckKey, boolean> => ({
  nails_trimmed: false, ears_cleaned: false, tangles_free: false,
  sanitary_trim: false, paw_pad_trim: false, perfume_spray: false,
})

// ─── Health Check Config (Bilingual EN / ZH) ──────────────────────────────
const HEALTH_CHECK_SECTIONS = [
  {
    key: 'eyes', emoji: '👁️', label: 'Eyes', labelZh: '眼睛',
    issues: [
      { key: 'redness_swelling',   en: 'Redness / Swelling',         zh: '紅腫' },
      { key: 'tear_duct',          en: 'Tear duct inflammation',      zh: '淚腺發炎' },
      { key: 'cant_open',          en: "Can't open eyes",             zh: '眼睛睜不開' },
      { key: 'visible_wound',      en: 'Visible wound',               zh: '有可見的傷口' },
    ],
  },
  {
    key: 'ears', emoji: '👂', label: 'Ears', labelZh: '耳朵',
    issues: [
      { key: 'severe_odor',        en: 'Severe odor inside',          zh: '裡面有嚴重臭味' },
      { key: 'redness_swelling',   en: 'Redness / Swelling',         zh: '紅腫' },
      { key: 'very_dirty',         en: 'Very dirty inside',           zh: '裡面非常髒' },
      { key: 'visible_wound',      en: 'Visible wound',               zh: '有可見的傷口' },
    ],
  },
  {
    key: 'nose', emoji: '👃', label: 'Nose', labelZh: '鼻子',
    issues: [
      { key: 'visible_wound',      en: 'Visible wound',               zh: '有可見的傷口' },
    ],
  },
  {
    key: 'mouth', emoji: '😬', label: 'Mouth / Teeth', labelZh: '嘴巴/牙齒',
    issues: [
      { key: 'visible_wound',      en: 'Visible wound',               zh: '有可見的傷口' },
      { key: 'bad_breath',         en: 'Severe bad breath',           zh: '嚴重口臭' },
    ],
  },
  {
    key: 'paws', emoji: '🐾', label: 'Paw Pads', labelZh: '腳掌',
    issues: [
      { key: 'visible_wound',      en: 'Visible wound',               zh: '有可見的傷口' },
    ],
  },
  {
    key: 'skin', emoji: '🧴', label: 'Skin & Coat', labelZh: '皮膚/毛髮',
    issues: [
      { key: 'visible_wound',      en: 'Visible wound',               zh: '有可見的傷口' },
      { key: 'bumps_etc',          en: 'Bumps, matting, hot spots, parasites', zh: '腫塊、毛結、熱點、寄生蟲' },
    ],
  },
] as const

type HealthCheckKey = typeof HEALTH_CHECK_SECTIONS[number]['key']
const EMPTY_HEALTH_CHECKS = (): Record<HealthCheckKey, string[]> => ({
  eyes: [], ears: [], nose: [], mouth: [], paws: [], skin: [],
})

const DOG_BREEDS_G = [
  'Affenpinscher','Afghan Hound','Airedale Terrier','Akita','Alaskan Malamute',
  'American Bulldog','American Eskimo Dog','American Pit Bull Terrier','Australian Cattle Dog',
  'Australian Shepherd','Australian Terrier','Basenji','Basset Hound','Beagle',
  'Bearded Collie','Belgian Malinois','Bernese Mountain Dog','Bichon Frise','Bloodhound',
  'Border Collie','Border Terrier','Boston Terrier','Boxer','Brittany','Brussels Griffon',
  'Bull Terrier','Bulldog','Bullmastiff','Cairn Terrier','Cavalier King Charles Spaniel',
  'Chihuahua','Chinese Crested','Chow Chow','Cockapoo','Cocker Spaniel','Collie','Corgi',
  'Dachshund','Dalmatian','Doberman Pinscher','Doodle','French Bulldog','German Shepherd',
  'German Shorthaired Pointer','Golden Retriever','Goldendoodle','Great Dane','Great Pyrenees',
  'Greyhound','Havanese','Irish Setter','Italian Greyhound','Jack Russell Terrier',
  'Labradoodle','Labrador Retriever','Lhasa Apso','Maltese','Maltipoo','Mastiff',
  'Miniature Pinscher','Miniature Schnauzer','Mixed Breed','Newfoundland','Old English Sheepdog',
  'Papillon','Pekingese','Pembroke Welsh Corgi','Pit Bull','Pomeranian','Pomsky','Poodle',
  'Portuguese Water Dog','Pug','Rottweiler','Saint Bernard','Samoyed','Schnauzer',
  'Scottish Terrier','Shetland Sheepdog','Shiba Inu','Shih Tzu','Siberian Husky',
  'Silky Terrier','Soft Coated Wheaten Terrier','Staffordshire Bull Terrier',
  'Toy Poodle','Vizsla','Weimaraner','Welsh Corgi','West Highland White Terrier',
  'Whippet','Wire Fox Terrier','Yorkshire Terrier',
]

function BreedInputG({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const suggestions = value.length >= 2 ? DOG_BREEDS_G.filter(b => b.toLowerCase().includes(value.toLowerCase())).slice(0, 7) : []
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} className="relative flex-1">
      <input type="text" value={value} onChange={e => { onChange(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        placeholder="Breed" autoComplete="off" className={className} />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map(b => (
            <li key={b} onMouseDown={e => { e.preventDefault(); onChange(b); setOpen(false) }}
              className="px-3 py-2 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer">{b}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

const SERVICE_LABELS: Record<string, string> = {
  simply_cute: 'Simply Cute',
  bath_brush: 'Bath & Brush',
  asian_fusion: 'Asian Fusion Style',
}

// Current time in the salon's timezone (Pacific/LA), as a Date whose local
// getters report LA wall-clock values — so earnings "today" is correct even
// when the device is in another timezone.
function salonNow(): Date {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date())
  const g = (t: string) => p.find(x => x.type === t)?.value ?? '00'
  const h = g('hour') === '24' ? '00' : g('hour')
  return new Date(+g('year'), +g('month') - 1, +g('day'), +h, +g('minute'), +g('second'))
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(time: string) {
  // Already in 12-hour format (e.g. "10:45 AM") — return as-is
  if (time.toUpperCase().includes('AM') || time.toUpperCase().includes('PM')) return time.trim()
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${m} ${period}`
}

function formatRequestedAt(isoStr?: string | null) {
  if (!isoStr) return null
  const d = new Date(isoStr)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' })
}

export default function GroomerDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<NavKey>('today')
  const prevPendingCountRef = useRef<number | null>(null)
  const [updateLoading, setUpdateLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [earningsRange, setEarningsRange] = useState<'today' | 'week' | 'this_payroll' | 'next_payroll' | 'last_payroll' | 'month' | 'year'>('this_payroll')
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [calendarSelected, setCalendarSelected] = useState<string | null>(null)
  const [calView, setCalView] = useState<'3day' | 'week' | 'month'>('month')
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)
  // Popup editing states
  const [popupServiceVal, setPopupServiceVal] = useState('')
  const [popupChangingService, setPopupChangingService] = useState(false)
  const [savingPopupServiceChange, setSavingPopupServiceChange] = useState(false)
  const [popupBasePrice, setPopupBasePrice] = useState('')
  const [popupBaseTier, setPopupBaseTier] = useState('')
  const [popupAddOns, setPopupAddOns] = useState<{id:string;name:string;price:string}[]>([])
  const [popupTotalSaved, setPopupTotalSaved] = useState(false)
  const [popupDiscount, setPopupDiscount] = useState(false)
  const [popupIsFirstTime, setPopupIsFirstTime] = useState(false)
  type Coupon = { id: string; name: string; code: string | null; discount_type: 'percent' | 'fixed'; discount_value: number; active: boolean; first_visit_only?: boolean }
  const [availableCoupons, setAvailableCoupons] = useState<Coupon[]>([])
  const [popupCouponId, setPopupCouponId] = useState<string | null>(null)
  const [savingPopupPayment, setSavingPopupPayment] = useState(false)
  const [popupPriceNote, setPopupPriceNote] = useState('')
  const [editingPopupNote, setEditingPopupNote] = useState(false)
  const [popupNoteText, setPopupNoteText] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteText, setEditingNoteText] = useState('')
  const [savingEditNote, setSavingEditNote] = useState(false)
  const [popupNoteTranslations, setPopupNoteTranslations] = useState<{ english: string; traditional: string; simplified: string; detected: string } | null>(null)
  const [translatingPopupNote, setTranslatingPopupNote] = useState(false)
  const [savingPopupNote, setSavingPopupNote] = useState(false)
  // 'none' | 'staff-new' (adding new groomer note) | 'customer-edit' (editing customer request)
  const [noteEditorMode, setNoteEditorMode] = useState<'none' | 'staff-new' | 'customer-edit'>('none')
  const [savingAddonId, setSavingAddonId] = useState<string | null>(null)
  const [addonDraft, setAddonDraft] = useState<Record<string, { text: string; price: string }>>({})
  const noteTranslateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noteIsComposingRef = useRef(false)
  const noteInputRef = useRef<HTMLTextAreaElement>(null)
  const [popupPetName, setPopupPetName] = useState('')
  const [editingPetInfo, setEditingPetInfo] = useState(false)
  const [popupBreed, setPopupBreed] = useState('')
  const [popupWeight, setPopupWeight] = useState('')
  const [popupPetTags, setPopupPetTags] = useState<PetTag[]>([])
  const [savingPetInfo, setSavingPetInfo] = useState(false)
  // Service definitions loaded from settings (for tier/size pricing)
  const [serviceDefs, setServiceDefs] = useState<{id:string;name:string;tiers:{label:string;price:string;duration?:string}[];visible?:boolean}[]>([])
  // Dynamic lookup: static labels + anything added via Settings
  const serviceMap: Record<string, string> = {
    ...SERVICE_LABELS,
    ...Object.fromEntries(serviceDefs.filter(s => s.name).map(s => [s.id, s.name])),
  }
  // All staff for assignment dropdowns
  const [allStaff, setAllStaff] = useState<string[]>([])
  const [assigningStaff, setAssigningStaff] = useState(false)
  // Reschedule modal state
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState<string>('')  // YYYY-MM-DD
  const [rescheduleTime, setRescheduleTime] = useState<string>('')
  const [rescheduleLoading, setRescheduleLoading] = useState(false)
  const [rescheduleSlots, setRescheduleSlots] = useState<string[]>([])

  // Health check modal state
  const [healthCheckAppt, setHealthCheckAppt] = useState<Appointment | null>(null)
  const [healthChecks, setHealthChecks] = useState<Record<HealthCheckKey, string[]>>(EMPTY_HEALTH_CHECKS())
  const [healthClearSections, setHealthClearSections] = useState<Set<HealthCheckKey>>(new Set())
  const [groomerNotes, setGroomerNotes] = useState('')
  const [healthNotesTranslations, setHealthNotesTranslations] = useState<{ english: string; traditional: string; simplified: string; detected: string } | null>(null)
  const [translatingHealthNotes, setTranslatingHealthNotes] = useState(false)
  const healthNotesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [submittingHealthCheck, setSubmittingHealthCheck] = useState(false)

  // Quality check modal state (when groomer hits "Done")
  const [qualityCheckAppt, setQualityCheckAppt] = useState<Appointment | null>(null)
  const [qualityChecks, setQualityChecks] = useState<Record<QualityCheckKey, boolean>>(EMPTY_QUALITY_CHECKS())
  const [groomerDiary, setGroomerDiary] = useState('')
  const [groomerDiaryTranslations, setGroomerDiaryTranslations] = useState<{ english: string; traditional: string; simplified: string } | null>(null)
  const [translatingGroomerDiary, setTranslatingGroomerDiary] = useState(false)
  const groomerDiaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [customerNote, setCustomerNote] = useState('')
  const [customerNoteTranslations, setCustomerNoteTranslations] = useState<{ english: string; traditional: string; simplified: string } | null>(null)
  const [translatingCustomerNote, setTranslatingCustomerNote] = useState(false)
  const customerNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [submittingQualityCheck, setSubmittingQualityCheck] = useState(false)

  // Track appointments the groomer has explicitly accepted — persisted in localStorage
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('groomer_accepted_ids')
      return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>()
    } catch { return new Set<string>() }
  })

  const loadAppointments = useCallback(async (staffName: string, silent = false) => {
    try {
      if (!silent) setLoading(true)
      const res = await fetch(`/api/groomer/appointments?staff_name=${encodeURIComponent(staffName)}`)
      const data = await res.json()
      const appts: Appointment[] = data.appointments || []

      // Count how many need acceptance right now (use groomer_confirmed from DB)
      const pendingCount = appts.filter(a =>
        a.status === 'pending' || a.status === 'rescheduled' ||
        (a.status === 'confirmed' && !a.groomer_confirmed)
      ).length

      prevPendingCountRef.current = pendingCount

      // Update home screen app badge (iOS 16.4+ / Android Chrome PWA)
      if ('setAppBadge' in navigator) {
        if (pendingCount > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (navigator as any).setAppBadge(pendingCount).catch(() => {})
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (navigator as any).clearAppBadge().catch(() => {})
        }
      }

      setAppointments(appts)
    } catch (err) {
      console.error(err)
      if (!silent) showToast('Failed to load appointments')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const authData = readAuthRaw('groomer')
    if (!authData) { router.push('/login'); return }
    const userData = JSON.parse(authData) as AuthUser
    setUser(userData)
    loadAppointments(userData.name || userData.staff_id)

    // Load all staff for assignment dropdowns
    fetch('/api/admin/staff').then(r => r.json()).then(d => {
      setAllStaff((d.staff ?? []).map((s: { name: string }) => s.name).filter(Boolean))
    }).catch(() => {})

    // Load service definitions on mount so names display correctly on all tabs
    fetch('/api/admin/settings').then(r => r.json()).then(d => {
      const settingsObj: Record<string, string> = d?.settings ?? {}
      const svcValue = settingsObj['services']
      if (svcValue) { try { setServiceDefs(JSON.parse(svcValue)) } catch { /**/ } }
    }).catch(() => {})

    // Load active coupons for groomer popup discount selector
    fetch('/api/admin/coupons').then(r => r.json()).then(d => {
      setAvailableCoupons((d.coupons ?? []).filter((c: Coupon) => c.active))
    }).catch(() => {})

    // Poll every 15 seconds for new pending appointments
    const interval = setInterval(() => {
      const latest = readAuthRaw('groomer')
      if (!latest) return
      const u = JSON.parse(latest) as AuthUser
      loadAppointments(u.name || u.staff_id, true)
    }, 15000)
    return () => clearInterval(interval)
  }, [router, loadAppointments])

  // Refresh appointments whenever the Pending tab is opened
  useEffect(() => {
    if (activeTab === 'pending') {
      const authData = readAuthRaw('groomer')
      if (!authData) return
      const userData = JSON.parse(authData) as AuthUser
      loadAppointments(userData.name || userData.staff_id, true)
    }
  }, [activeTab, loadAppointments])

  // ── PWA: register service worker + subscribe to push notifications ────────
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return
    const authData = readAuthRaw('groomer')
    if (!authData) return
    const userData = JSON.parse(authData) as AuthUser
    const staffName = userData.name || userData.staff_id

    const setupPush = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/staff-sw.js')
        await navigator.serviceWorker.ready

        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return

        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey) return

        const b64 = vapidKey.replace(/-/g, '+').replace(/_/g, '/')
        const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0))

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: raw,
        })

        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staff_name: staffName, subscription: sub.toJSON() }),
        })
      } catch (e) {
        console.warn('Push setup failed:', e)
      }
    }

    setupPush()
  }, [])

  // Persist accepted appointment IDs across page reloads
  useEffect(() => {
    try {
      localStorage.setItem('groomer_accepted_ids', JSON.stringify([...acceptedIds]))
    } catch {}
  }, [acceptedIds])

  const handleAction = async (appointmentId: string, action: string) => {
    // If "complete", show health check modal instead of directly completing
    if (action === 'start') {
      // Show health check modal when starting appointment
      const appt = appointments.find(a => a.id === appointmentId)
      if (appt) {
        setHealthCheckAppt(appt)
        setHealthChecks(EMPTY_HEALTH_CHECKS())
        setHealthClearSections(new Set())
        setGroomerNotes('')
        setHealthNotesTranslations(null)
        if (healthNotesTimerRef.current) clearTimeout(healthNotesTimerRef.current)
      }
      return
    }

    if (action === 'complete') {
      // Show quality check modal when completing appointment
      const appt = appointments.find(a => a.id === appointmentId)
      if (appt) {
        if (!appt.payment_amount) {
          showToast('⚠️ Please enter price first')
          return
        }
        setQualityCheckAppt(appt)
        setQualityChecks(EMPTY_QUALITY_CHECKS())
        setGroomerDiary('')
        setGroomerDiaryTranslations(null)
        setCustomerNote('')
        setCustomerNoteTranslations(null)
        // Prefill from any existing notes so edits don't lose prior content
        {
          const q = (appt as unknown as { grooming_quality?: {
            groomer_diary?: string|null
            groomer_diary_english?: string|null; groomer_diary_traditional?: string|null; groomer_diary_simplified?: string|null
            customer_note_raw?: string|null
            customer_note_english?: string|null; customer_note_traditional?: string|null; customer_note_simplified?: string|null
          } }).grooming_quality
          if (q?.groomer_diary) setGroomerDiary(q.groomer_diary)
          if (q?.groomer_diary_english || q?.groomer_diary_traditional || q?.groomer_diary_simplified) {
            setGroomerDiaryTranslations({ english: q.groomer_diary_english ?? '', traditional: q.groomer_diary_traditional ?? '', simplified: q.groomer_diary_simplified ?? '' })
          }
          if (q?.customer_note_raw) setCustomerNote(q.customer_note_raw)
          if (q?.customer_note_english || q?.customer_note_traditional || q?.customer_note_simplified) {
            setCustomerNoteTranslations({ english: q.customer_note_english ?? '', traditional: q.customer_note_traditional ?? '', simplified: q.customer_note_simplified ?? '' })
          }
        }
      }
      return
    }

    try {
      setUpdateLoading(appointmentId)

      // Map groomer actions to the grooming pipeline API
      const groomingMap: Record<string, string> = {
        start:    'incare',
      }
      const groomingStatus = groomingMap[action]

      const body = groomingStatus
        ? { action: 'grooming-status', grooming_status: groomingStatus }
        : { action }

      const res = await fetch(`/api/admin/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        // Update local state
        if (groomingStatus) {
          setAppointments(prev =>
            prev.map(a => a.id === appointmentId ? { ...a, grooming_status: groomingStatus } : a)
          )
        } else if (action === 'confirm') {
          setAppointments(prev =>
            prev.map(a => a.id === appointmentId ? { ...a, status: 'confirmed', groomer_confirmed: true } : a)
          )
        }
        showToast(action === 'start' ? '▶ Started!' : 'Updated!')
      }
    } catch (err) {
      console.error(err)
      showToast('Failed to update')
    } finally {
      setUpdateLoading(null)
    }
  }

  const submitHealthCheck = async () => {
    if (!healthCheckAppt) return
    setSubmittingHealthCheck(true)
    try {
      // Submit health check and start grooming
      const res = await fetch(`/api/admin/appointments/${healthCheckAppt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grooming-status',
          grooming_status: 'incare',
          health_check: {
            eyes: healthChecks.eyes,
            ears: healthChecks.ears,
            nose: healthChecks.nose,
            mouth: healthChecks.mouth,
            paws: healthChecks.paws,
            skin: healthChecks.skin,
            cleared_sections: Array.from(healthClearSections),
            groomer_notes: groomerNotes,
            groomer_notes_english: healthNotesTranslations?.detected !== 'english' ? (healthNotesTranslations?.english ?? null) : null,
            groomer_notes_chinese: healthNotesTranslations?.detected !== 'traditional' ? (healthNotesTranslations?.traditional ?? null) : null,
          },
        }),
      })
      if (res.ok) {
        setAppointments(prev =>
          prev.map(a => a.id === healthCheckAppt.id ? { ...a, grooming_status: 'incare' } : a)
        )
        showToast('▶ Grooming started!')
      } else {
        const error = await res.json().catch(() => ({}))
        showToast(error.error || 'Failed to start grooming')
      }
    } catch (err) {
      console.error(err)
      showToast('Error starting grooming')
    } finally {
      setSubmittingHealthCheck(false)
      setHealthCheckAppt(null) // Close modal regardless of success/error
    }
  }

  const submitQualityCheck = async () => {
    if (!qualityCheckAppt) return
    setSubmittingQualityCheck(true)
    try {
      // Submit quality check and mark appointment as ready for pickup
      const res = await fetch(`/api/admin/appointments/${qualityCheckAppt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grooming-status',
          grooming_status: 'ready',
          grooming_quality: {
            ...qualityChecks,
            groomer_diary: groomerDiary,
            groomer_diary_english: groomerDiaryTranslations?.english ?? groomerDiary,
            groomer_diary_traditional: groomerDiaryTranslations?.traditional ?? '',
            groomer_diary_simplified: groomerDiaryTranslations?.simplified ?? '',
            customer_note_raw: customerNote,
            customer_note_english: customerNoteTranslations?.english ?? customerNote,
            customer_note_traditional: customerNoteTranslations?.traditional ?? '',
            customer_note_simplified: customerNoteTranslations?.simplified ?? '',
          },
        }),
      })
      if (res.ok) {
        setAppointments(prev =>
          prev.map(a => a.id === qualityCheckAppt.id ? { ...a, grooming_status: 'ready' } : a)
        )
        showToast('✓ Ready for pickup!')
      } else {
        const error = await res.json().catch(() => ({}))
        showToast(error.error || 'Failed to mark ready')
      }
    } catch (err) {
      console.error(err)
      showToast('Error marking ready')
    } finally {
      setSubmittingQualityCheck(false)
      setQualityCheckAppt(null) // Close modal regardless of success/error
    }
  }

  // Groomer accept: pending/rescheduled → call confirm API; confirmed → save groomer_confirmed to DB
  const handleAccept = async (appt: Appointment) => {
    if (appt.status === 'pending' || appt.status === 'rescheduled') {
      await handleAction(appt.id, 'confirm')
      if (appt.status === 'rescheduled') showToast('✓ Reschedule accepted!')
    } else {
      // Already confirmed by admin — record groomer's confirmation in DB
      setUpdateLoading(appt.id)
      try {
        const res = await fetch(`/api/admin/appointments/${appt.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'groomer-accept' }),
        })
        if (res.ok) {
          // Update local state so appointment disappears from pending immediately
          setAppointments(prev =>
            prev.map(a => a.id === appt.id ? { ...a, groomer_confirmed: true } : a)
          )
          showToast('✓ Accepted!')
        } else {
          showToast('⚠️ Could not accept. Try again.')
        }
      } catch { showToast('⚠️ Error accepting appointment') }
      finally { setUpdateLoading(null) }
    }
    setAcceptedIds(prev => new Set([...prev, appt.id]))
  }

  // Groomer declines: clear their assignment so admin knows to reassign
  const handleDecline = async (appt: Appointment) => {
    if (!user) return
    setUpdateLoading(appt.id)
    try {
      const res = await fetch(`/api/admin/appointments/${appt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'groomer-decline', groomer_name: user.name || user.staff_id }),
      })
      if (res.ok) {
        // Remove from local appointments so it disappears from pending
        setAppointments(prev => prev.filter(a => a.id !== appt.id))
        showToast('Appointment declined — admin will reassign.')
      } else {
        showToast('⚠️ Could not decline. Try again.')
      }
    } catch { showToast('⚠️ Error declining appointment') }
    finally { setUpdateLoading(null) }
  }

  // ── Popup editing helpers ────────────────────────────────────────────────

  const openApptPopup = async (appt: Appointment) => {
    setPopupServiceVal(appt.service)
    setPopupChangingService(false)
    // Load saved add-ons from notes_list (is_addon: true entries)
    const savedAddOns = (appt.notes_list ?? [])
      .filter(n => n.is_addon)
      .map(n => ({ id: n.id, name: n.text, price: n.price ?? '' }))
    setPopupAddOns(savedAddOns)
    setPopupTotalSaved(!!appt.payment_amount)
    setPopupDiscount(false)
    setPopupCouponId(null)
    setPopupIsFirstTime(false)
    setPopupPriceNote('')
    setEditingPopupNote(false)
    setPopupNoteText('')
    setPopupNoteTranslations(null)
    setTranslatingPopupNote(false)
    setSavingPopupNote(false)
    setPopupPetName(appt.pets?.name ?? '')
    setEditingPetInfo(false)
    setPopupBreed(appt.pets?.breed ?? '')
    setPopupWeight(appt.pets?.weight ?? '')
    setSavingPetInfo(false)
    setSelectedAppt(appt)
    setPopupPetTags([])

    // Fetch pet tags
    if (appt.pets?.id) {
      fetch(`/api/admin/pet-tags?pet_id=${appt.pets.id}`)
        .then(r => r.json())
        .then(d => setPopupPetTags((d.tags ?? []) as PetTag[]))
        .catch(() => {/**/})
    }

    // Auto-translate legacy customer note if missing translation
    const apptAny = appt as unknown as { notes?: string | null; notes_english?: string | null; notes_chinese?: string | null }
    if (apptAny.notes && apptAny.notes.trim() && !apptAny.notes_english && !apptAny.notes_chinese) {
      ;(async () => {
        try {
          const tRes = await fetch('/api/translate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: apptAny.notes }),
          })
          const tData = await tRes.json()
          if (tData.english || tData.traditional) {
            const newEng = tData.detected !== 'english' ? (tData.english || null) : null
            const newChi = tData.detected !== 'traditional' ? (tData.traditional || null) : null
            await fetch(`/api/admin/appointments/${appt.id}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'update-note-translations', noteId: '__legacy__', notes_english: newEng, notes_chinese: newChi }),
            })
            setSelectedAppt(prev => prev && prev.id === appt.id
              ? ({ ...prev, notes_english: newEng, notes_chinese: newChi } as unknown as typeof prev)
              : prev)
          }
        } catch (e) { console.error('Customer note auto-translate failed:', e) }
      })()
    }

    // Pre-fill price: use current appointment amount minus saved add-ons, else fetch last paid amount for this pet
    if (appt.payment_amount) {
      const addonTotal = savedAddOns.reduce((s, a) => s + (parseFloat(a.price) || 0), 0)
      // payment_amount is post-discount; add the saved discount back to rebuild the
      // pre-discount base, then restore the discount/coupon so the total re-derives.
      const savedDiscount = parseFloat((appt as { discount_amount?: string | null }).discount_amount || '') || 0
      const base = parseFloat(appt.payment_amount) + savedDiscount - addonTotal
      setPopupBasePrice(base > 0 ? base.toString() : appt.payment_amount)
      setPopupBaseTier((appt as { size_tier?: string | null }).size_tier || '')
      if (savedDiscount > 0) {
        const label = (appt as { discount_label?: string | null }).discount_label || ''
        const savedPct = parseFloat((appt as { discount_percent?: string | null }).discount_percent || '')
        // Match the saved discount to a coupon: by exact name, else by the same
        // percent (older labels like "New customer 20% off" won't match the new
        // code names, but the 20% value still does).
        const matchedCoupon = availableCoupons.find(c => c.name === label)
          ?? availableCoupons.find(c => !isNaN(savedPct) && c.discount_type === 'percent' && c.discount_value === savedPct)
        if (matchedCoupon) { setPopupCouponId(matchedCoupon.id); setPopupDiscount(false) }
        else { setPopupDiscount(true); setPopupCouponId(null) }
      }
    } else if (appt.pets?.id) {
      setPopupBasePrice('')
      setPopupBaseTier('')
      try {
        const res = await fetch(`/api/groomer/last-payment?pet_id=${appt.pets.id}&exclude_id=${appt.id}`)
        const data = await res.json()
        if (data.amount) {
          setPopupBasePrice(data.amount)
          setPopupBaseTier('')
          setPopupTotalSaved(false) // show as a suggestion, not confirmed
          setPopupIsFirstTime(false)
        } else {
          setPopupIsFirstTime(true) // no previous paid appointment — first-time!
        }
      } catch { /**/ }
    } else {
      setPopupBasePrice('')
      setPopupBaseTier('')
    }

    // Load service definitions if not yet loaded
    if (serviceDefs.length === 0) {
      try {
        const res = await fetch('/api/admin/settings')
        const data = await res.json()
        const settingsObj: Record<string, string> = data?.settings ?? {}
        const svcValue = settingsObj['services']
        if (svcValue) setServiceDefs(JSON.parse(svcValue))
      } catch { /**/ }
    }
  }

  const closeApptPopup = () => {
    setSelectedAppt(null)
  }

  // ── Notes: auto-translate (800ms debounce) ────────────────────────────────
  const triggerAutoTranslate = useCallback((text: string) => {
    if (noteTranslateTimerRef.current) clearTimeout(noteTranslateTimerRef.current)
    if (!text.trim()) { setPopupNoteTranslations(null); return }
    noteTranslateTimerRef.current = setTimeout(async () => {
      setTranslatingPopupNote(true)
      try {
        const res = await fetch('/api/translate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        const data = await res.json()
        if (data.english !== undefined || data.traditional !== undefined) {
          setPopupNoteTranslations({
            english: data.english || '',
            traditional: data.traditional || '',
            simplified: data.simplified || '',
            detected: data.detected || 'unknown',
          })
        }
      } catch {/**/}
      finally { setTranslatingPopupNote(false) }
    }, 800)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const savePopupNote = async () => {
    const noteText = noteInputRef.current?.value?.trim() ?? ''
    if (!selectedAppt || !noteText) return
    setSavingPopupNote(true)
    try {
      const newNote = {
        id: `note-${Date.now()}`,
        text: noteText,
        author: user?.name || 'Groomer',
        created_at: new Date().toISOString(),
        notes_english: popupNoteTranslations?.detected !== 'english' ? (popupNoteTranslations?.english ?? null) : null,
        notes_chinese: popupNoteTranslations?.detected !== 'traditional' ? (popupNoteTranslations?.traditional ?? null) : null,
      }
      const res = await fetch(`/api/admin/appointments/${selectedAppt.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-note', note: newNote }),
      })
      const data = await res.json()
      if (data.success) {
        const updatedList = data.notes_list ?? [...(selectedAppt.notes_list ?? []), newNote]
        const updated = { ...selectedAppt, notes_list: updatedList }
        setSelectedAppt(updated)
        setAppointments(prev => prev.map(a => a.id === selectedAppt.id ? updated : a))
        setPopupNoteText('')
        setPopupNoteTranslations(null)
        setEditingPopupNote(false)
        setNoteEditorMode('none')
        showToast('✓ Note saved!')
      }
    } catch {/**/}
    finally { setSavingPopupNote(false) }
  }

  const addAddonQuick = async (apptId: string, name: string, price: string) => {
    setSavingAddonId(apptId)
    try {
      const note = { id: Date.now().toString(), text: name, price, is_addon: true }
      const res = await fetch(`/api/admin/appointments/${apptId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-note', note }),
      })
      const data = await res.json()
      if (res.ok) {
        const updated = { ...selectedAppt!, notes_list: data.notes_list }
        setSelectedAppt(updated)
        setAppointments(prev => prev.map(a => a.id === apptId ? updated : a))
      }
    } catch {/**/}
    setSavingAddonId(null)
  }

  const addAddonCustom = async (apptId: string) => {
    const draft = addonDraft[apptId]
    if (!draft?.text.trim()) return
    setSavingAddonId(apptId)
    try {
      const note = { id: Date.now().toString(), text: draft.text, price: draft.price, is_addon: true }
      const res = await fetch(`/api/admin/appointments/${apptId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-note', note }),
      })
      const data = await res.json()
      if (res.ok) {
        const updated = { ...selectedAppt!, notes_list: data.notes_list }
        setSelectedAppt(updated)
        setAppointments(prev => prev.map(a => a.id === apptId ? updated : a))
        setAddonDraft(prev => ({ ...prev, [apptId]: { text: '', price: '' } }))
      }
    } catch {/**/}
    setSavingAddonId(null)
  }

  const removeAddonGroomer = async (apptId: string, noteId: string) => {
    try {
      const res = await fetch(`/api/admin/appointments/${apptId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-note', noteId }),
      })
      const data = await res.json()
      if (res.ok) {
        const updated = { ...selectedAppt!, notes_list: data.notes_list }
        setSelectedAppt(updated)
        setAppointments(prev => prev.map(a => a.id === apptId ? updated : a))
      }
    } catch {/**/}
  }

  // Save/update the customer request (legacy appointments.notes field)
  const saveCustomerRequest = async () => {
    const text = noteInputRef.current?.value?.trim() ?? ''
    if (!selectedAppt) return
    setSavingPopupNote(true)
    try {
      const notes_english = popupNoteTranslations?.detected !== 'english' ? (popupNoteTranslations?.english ?? null) : null
      const notes_chinese = popupNoteTranslations?.detected !== 'traditional' ? (popupNoteTranslations?.traditional ?? null) : null
      const res = await fetch(`/api/admin/appointments/${selectedAppt.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-notes', notes: text, notes_english, notes_chinese }),
      })
      const data = await res.json()
      if (data.success) {
        const updated = { ...selectedAppt, notes: text, notes_english, notes_chinese } as typeof selectedAppt
        setSelectedAppt(updated)
        setAppointments(prev => prev.map(a => a.id === selectedAppt.id ? updated : a))
        setPopupNoteText(''); setPopupNoteTranslations(null); setNoteEditorMode('none'); setEditingPopupNote(false)
        showToast('✓ Customer request saved!')
      }
    } catch {/**/}
    finally { setSavingPopupNote(false) }
  }

  const deletePopupNote = async (noteId: string) => {
    if (!selectedAppt) return
    setSavingPopupNote(true)
    try {
      const res = await fetch(`/api/admin/appointments/${selectedAppt.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-note', noteId }),
      })
      const data = await res.json()
      if (data.success) {
        const updated = { ...selectedAppt, notes_list: data.notes_list ?? (selectedAppt.notes_list ?? []).filter((n: { id: string }) => n.id !== noteId) }
        setSelectedAppt(updated)
        setAppointments(prev => prev.map(a => a.id === selectedAppt.id ? updated : a))
        showToast('✓ Note deleted')
      }
    } catch {/**/}
    finally { setSavingPopupNote(false) }
  }

  const updatePopupNote = async (noteId: string, text: string) => {
    if (!selectedAppt || !text.trim()) return
    setSavingEditNote(true)
    try {
      // 1. Update the note text
      const res = await fetch(`/api/admin/appointments/${selectedAppt.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-note', noteId, text: text.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        let updatedList = data.notes_list ?? (selectedAppt.notes_list ?? []).map((n: { id: string }) => n.id === noteId ? { ...n, text: text.trim() } : n)
        const updated = { ...selectedAppt, notes_list: updatedList }
        setSelectedAppt(updated)
        setAppointments(prev => prev.map(a => a.id === selectedAppt.id ? updated : a))
        setEditingNoteId(null)
        setEditingNoteText('')
        showToast('✓ Note updated!')

        // 2. Re-translate in background (non-blocking)
        try {
          const tRes = await fetch('/api/translate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text.trim() }),
          })
          const tData = await tRes.json()
          if (tData.english || tData.traditional) {
            const newEnglish = tData.detected !== 'english' ? (tData.english || null) : null
            const newChinese = tData.detected !== 'traditional' ? (tData.traditional || null) : null
            await fetch(`/api/admin/appointments/${selectedAppt.id}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'update-note-translations', noteId, notes_english: newEnglish, notes_chinese: newChinese }),
            })
            // Update local state with new translations
            updatedList = updatedList.map((n: { id: string }) => n.id === noteId ? { ...n, notes_english: newEnglish, notes_chinese: newChinese } : n)
            const updatedWithTranslations = { ...selectedAppt, notes_list: updatedList }
            setSelectedAppt(updatedWithTranslations)
            setAppointments(prev => prev.map(a => a.id === selectedAppt.id ? updatedWithTranslations : a))
          }
        } catch { /* translation failed silently */ }
      }
    } catch {/**/}
    finally { setSavingEditNote(false) }
  }

  const handleLogout = () => {
    clearAuth('groomer')
    router.push('/login')
  }

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // ── Derived data ────────────────────────────────────────────────────────
  // Use salon (LA) time, not the viewer's device clock, so "today" and "late"
  // are correct when staff view from another timezone (e.g. traveling).
  const _now = salonNow()
  const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`

  // Today tab — only show appointments the groomer has already accepted (groomer_confirmed)
  // Unaccepted appointments stay in Pending until the groomer confirms them
  const todayAppts = appointments.filter(a =>
    a.appointment_date === today &&
    a.groomer_confirmed === true &&
    a.status !== 'cancelled'
  )
  const parseApptMins = (t: string) => {
    const upper = t.toUpperCase().trim()
    const [timePart, meridiem] = upper.split(' ')
    const [hStr, mStr] = timePart.split(':')
    let h = parseInt(hStr); const m = parseInt(mStr || '0')
    if (meridiem === 'PM' && h !== 12) h += 12
    if (meridiem === 'AM' && h === 12) h = 0
    return h * 60 + m
  }
  const nowMins = _now.getHours() * 60 + _now.getMinutes()
  const isLate = (a: Appointment) =>
    !a.grooming_status &&
    a.status !== 'cancelled' &&
    a.status !== 'completed' &&
    parseApptMins(a.appointment_time) < nowMins - 5
  const isVeryLate = (a: Appointment) =>
    isLate(a) && parseApptMins(a.appointment_time) < nowMins - 15
  const todayLate = todayAppts
    .filter(isLate)
    .sort((a, b) => parseApptMins(a.appointment_time) - parseApptMins(b.appointment_time))
  const todayComingUp = todayAppts
    .filter(a =>
      !isLate(a) &&
      a.grooming_status !== 'incare' &&
      a.grooming_status !== 'ready' &&
      a.grooming_status !== 'done' &&
      a.status !== 'completed' &&
      a.status !== 'cancelled'
    )
    .sort((a, b) => parseApptMins(a.appointment_time) - parseApptMins(b.appointment_time))
  const todayInProgress = todayAppts
    .filter(a => a.grooming_status === 'incare')
    .sort((a, b) => parseApptMins(a.appointment_time) - parseApptMins(b.appointment_time))
  const todayDone = todayAppts
    .filter(a => a.grooming_status === 'ready' || a.grooming_status === 'done' || a.status === 'completed')
    .sort((a, b) => parseApptMins(a.appointment_time) - parseApptMins(b.appointment_time))

  // Pending (today + future appointments that need acceptance)
  const upcomingAppts = appointments
    .filter(a => a.appointment_date >= today && a.status !== 'cancelled' && a.status !== 'completed')
    .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date) || a.appointment_time.localeCompare(b.appointment_time))
  // Count appointments that still need the groomer's explicit acceptance
  // Use groomer_confirmed from DB as source of truth (not localStorage)
  const pendingBadge = upcomingAppts.filter(a =>
    a.status === 'rescheduled' ||
    (a.status === 'pending') ||
    (a.status === 'confirmed' && !a.groomer_confirmed)
  ).length
  // How many of today's appointments are still waiting for acceptance
  const todayUnacceptedCount = appointments.filter(a =>
    a.appointment_date === today &&
    a.status !== 'cancelled' &&
    (a.status === 'rescheduled' || a.status === 'pending' || (a.status === 'confirmed' && !a.groomer_confirmed))
  ).length

  // Calendar
  const calYear = calendarMonth.getFullYear()
  const calMonthIdx = calendarMonth.getMonth()
  const daysInMonth = new Date(calYear, calMonthIdx + 1, 0).getDate()
  const firstDayOfWeek = new Date(calYear, calMonthIdx, 1).getDay()
  const apptsByDate: Record<string, Appointment[]> = {}
  appointments.forEach(a => {
    if (!apptsByDate[a.appointment_date]) apptsByDate[a.appointment_date] = []
    apptsByDate[a.appointment_date].push(a)
  })
  const selectedDayAppts = calendarSelected
    ? (apptsByDate[calendarSelected] || []).sort((a, b) => a.appointment_time.localeCompare(b.appointment_time))
    : []

  // Earnings
  const commissionPct = user?.commission_percent ?? 0
  const tipPct = user?.tip_percent ?? 0
  const now = salonNow(); if (now.getHours() < 4) now.setDate(now.getDate() - 1) // salon (LA) time
  const currentYear = now.getFullYear()
  const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 6)
  const fmtLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const weekAgoStr = fmtLocal(weekAgo)
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const yearStart = `${currentYear}-01-01`
  const todayStr = fmtLocal(now)

  // ── Payroll periods (bi-weekly, anchor: 2026-05-10) ───────────────────────
  const PAYROLL_ANCHOR = new Date(2026, 4, 24) // May 24, 2026 (Sunday); periods run Sun→Sat
  const PERIOD_DAYS = 14
  const daysSinceAnchor = Math.floor((now.getTime() - PAYROLL_ANCHOR.getTime()) / (1000 * 60 * 60 * 24))
  const periodsElapsed = Math.floor(daysSinceAnchor / PERIOD_DAYS)
  // "This Pay" = the most recently COMPLETED period (the one being paid now),
  // not the in-progress one — so subtract a period from the current index.
  const thisPayrollStart = new Date(PAYROLL_ANCHOR); thisPayrollStart.setDate(PAYROLL_ANCHOR.getDate() + (periodsElapsed - 1) * PERIOD_DAYS)
  const thisPayrollEnd = new Date(thisPayrollStart); thisPayrollEnd.setDate(thisPayrollStart.getDate() + PERIOD_DAYS - 1)
  const lastPayrollStart = new Date(thisPayrollStart); lastPayrollStart.setDate(thisPayrollStart.getDate() - PERIOD_DAYS)
  const lastPayrollEnd = new Date(thisPayrollStart); lastPayrollEnd.setDate(thisPayrollStart.getDate() - 1)
  const fmt = fmtLocal
  // "Next Pay" = the period currently in progress (accruing, not yet paid).
  const nextPayrollStart = new Date(thisPayrollStart); nextPayrollStart.setDate(thisPayrollStart.getDate() + PERIOD_DAYS)
  const nextPayrollEnd = new Date(nextPayrollStart); nextPayrollEnd.setDate(nextPayrollStart.getDate() + PERIOD_DAYS - 1)
  const thisPayrollStartStr = fmt(thisPayrollStart)
  const thisPayrollEndStr = fmt(thisPayrollEnd)
  const lastPayrollStartStr = fmt(lastPayrollStart)
  const lastPayrollEndStr = fmt(lastPayrollEnd)
  const nextPayrollStartStr = fmt(nextPayrollStart)
  const nextPayrollEndStr = fmt(nextPayrollEnd)

  const paidAppts = appointments.filter(a => {
    // Count as paid if: payment_status is explicitly set, OR appointment is done with an amount recorded (legacy pre-kiosk-fix appts)
    const countAsPaid =
      a.payment_status === 'paid' ||
      a.payment_status === 'cash_pending' ||
      ((a.status === 'completed' || a.grooming_status === 'done') && a.payment_amount && parseFloat(a.payment_amount) > 0)
    if (!countAsPaid) return false
    if (earningsRange === 'today') return a.appointment_date === todayStr
    if (earningsRange === 'week') return a.appointment_date >= weekAgoStr
    if (earningsRange === 'this_payroll') return a.appointment_date >= thisPayrollStartStr && a.appointment_date <= thisPayrollEndStr
    if (earningsRange === 'next_payroll') return a.appointment_date >= nextPayrollStartStr && a.appointment_date <= nextPayrollEndStr
    if (earningsRange === 'last_payroll') return a.appointment_date >= lastPayrollStartStr && a.appointment_date <= lastPayrollEndStr
    if (earningsRange === 'month') return a.appointment_date >= monthStart
    if (earningsRange === 'year') return a.appointment_date >= yearStart
    return true
  })
  const cashPendingCount = paidAppts.filter(a => a.payment_status === 'cash_pending').length
  // Commission is on the full price before discount, so add the discount back.
  const grossRevenue = paidAppts.reduce((s, a) => s + parseFloat(a.payment_amount || '0') + parseFloat((a as { discount_amount?: string | null }).discount_amount || '0'), 0)
  const totalDiscount = paidAppts.reduce((s, a) => s + parseFloat((a as { discount_amount?: string | null }).discount_amount || '0'), 0)
  const netCollected = grossRevenue - totalDiscount
  const totalRevenue = grossRevenue
  const totalTips = paidAppts.reduce((s, a) => s + parseFloat(a.tip_amount || '0'), 0)
  const commission = grossRevenue * commissionPct / 100
  const tipInPaycheck = totalTips * tipPct / 100
  const rangeLabelMap = {
    today: 'Today',
    week: 'This Week',
    this_payroll: 'This Pay',
    next_payroll: 'Next Pay',
    last_payroll: 'Last Pay',
    month: 'This Month',
    year: String(currentYear),
  }

  // ── Nav items ────────────────────────────────────────────────────────────
  const navItems: { key: NavKey; label: string; badge?: number; icon: React.ReactNode }[] = [
    {
      key: 'today',
      label: 'Today',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      ),
    },
    {
      key: 'pending',
      label: 'Pending',
      badge: pendingBadge || undefined,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      ),
    },
    {
      key: 'calendar',
      label: 'Calendar',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
        </svg>
      ),
    },
    {
      key: 'earnings',
      label: 'Earnings',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v1m0 8v1M9.5 9.5C9.5 8.4 10.6 8 12 8s2.5.4 2.5 1.5S13.4 11 12 11s-2.5.6-2.5 1.5S10.6 16 12 16s2.5-.4 2.5-1.5" />
        </svg>
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50 pb-24">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Kokoni" width={34} height={34} className="rounded-full" />
            <div>
              <p className="text-sm font-bold text-gray-800 leading-tight">{user?.name ?? '—'}</p>
              <p className="text-xs text-gray-500 capitalize leading-tight">{user?.role ?? ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <button
              onClick={handleLogout}
              className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 ml-1"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* ── Toast ───────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-yellow-100 border border-yellow-300 text-yellow-800 px-6 py-3 rounded-full shadow-lg z-50 text-sm font-bold whitespace-nowrap text-center">
          {toast}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TODAY TAB                                                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'today' && (
        <div className="px-4 pt-5 pb-4 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Today</h2>
            <p className="text-sm text-gray-400">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <p className="text-xs font-medium mt-1">
              {todayLate.length > 0 && <><span className="text-rose-600 font-bold">Late: {todayLate.length}</span> · </>}
              <span className="text-blue-700 font-bold">In Progress: {todayInProgress.length}</span>
              {' · '}
              <span className="text-orange-700 font-bold">Upcoming: {todayComingUp.length}</span>
              {' · '}
              <span className="text-green-700 font-bold">Done: {todayDone.length}</span>
            </p>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
          ) : todayAppts.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">🌿</div>
              <p className="text-sm font-medium">No accepted appointments today</p>
              {todayUnacceptedCount > 0 && (
                <p className="text-xs mt-2 text-amber-600 font-medium">
                  {todayUnacceptedCount} appointment{todayUnacceptedCount !== 1 ? 's' : ''} waiting in Pending — tap to accept
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Late — overdue, not started yet */}
              {todayLate.length > 0 && (
                <section className="bg-rose-50 border border-rose-200 rounded-2xl p-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-rose-600 mb-2.5 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                    Late · {todayLate.length}
                  </p>
                  <div className="space-y-2">
                    {todayLate.map(a => (
                      <ApptCard
                        key={a.id}
                        appt={a}
                        onAction={handleAction}
                        onTap={(a) => openApptPopup(a)}
                        onReschedule={(a) => { setRescheduleAppt(a); setRescheduleDate(''); setRescheduleTime(''); setRescheduleSlots([]) }}
                        loadingId={updateLoading}
                        showStart
                        showReschedule
                        showNoShow={isVeryLate(a)}
                        serviceLabels={serviceMap}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* In Progress */}
              {todayInProgress.length > 0 && (
                <section className="bg-blue-100 border-2 border-blue-300 rounded-2xl p-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-blue-700 mb-2.5 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    In Progress · {todayInProgress.length}
                  </p>
                  <div className="space-y-2">
                    {todayInProgress.map(a => (
                      <ApptCard
                        key={a.id}
                        appt={a}
                        onAction={handleAction}
                        onTap={(a) => openApptPopup(a)}
                        loadingId={updateLoading}
                        showComplete
                        serviceLabels={serviceMap}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Coming Up — sorted earliest first */}
              {todayComingUp.length > 0 && (
                <section className="bg-orange-100 border-2 border-orange-300 rounded-2xl p-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-orange-700 mb-2.5">
                    Coming Up · {todayComingUp.length}
                  </p>
                  <div className="space-y-2">
                    {todayComingUp.map(a => (
                      <ApptCard
                        key={a.id}
                        appt={a}
                        onAction={handleAction}
                        onTap={(a) => openApptPopup(a)}
                        loadingId={updateLoading}
                        showStart
                        serviceLabels={serviceMap}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Done */}
              {todayDone.length > 0 && (
                <section className="bg-green-100 border-2 border-green-300 rounded-2xl p-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-green-700 mb-2.5">
                    Done · {todayDone.length}
                  </p>
                  <div className="space-y-2">
                    {todayDone.map(a => (
                      <ApptCard
                        key={a.id}
                        appt={a}
                        onAction={handleAction}
                        onTap={(a) => openApptPopup(a)}
                        loadingId={updateLoading}
                        serviceLabels={serviceMap}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* PENDING / UPCOMING TAB                                             */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'pending' && (
        <div className="px-4 pt-5 pb-4 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Pending</h2>
            <p className="text-sm text-gray-400">
              {pendingBadge > 0
                ? `${pendingBadge} appointment${pendingBadge !== 1 ? 's' : ''} need your acceptance`
                : 'All caught up ✓'}
            </p>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
          ) : (() => {
            const needsAcceptance = upcomingAppts.filter(
              a => a.status === 'rescheduled' ||
                a.status === 'pending' ||
                (a.status === 'confirmed' && !a.groomer_confirmed)
            )
            return needsAcceptance.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-4xl mb-3">✨</div>
                <p className="text-sm font-medium">No pending appointments</p>
                <p className="text-xs mt-1">All assignments accepted</p>
              </div>
            ) : (
              <div className="space-y-2">
                {needsAcceptance.map(a => (
                  <ApptCard
                    key={a.id}
                    appt={a}
                    onAction={handleAction}
                    onAccept={handleAccept}
                    onDecline={handleDecline}
                    loadingId={updateLoading}
                    showAccept
                    showDateBadge
                    serviceLabels={serviceMap}
                  />
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* CALENDAR TAB                                                       */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'calendar' && (
        <div className="px-4 pt-5 pb-4">

          {/* View toggle */}
          <div className="flex gap-1.5 mb-4">
            {(['3day', 'week', 'month'] as const).map(v => (
              <button
                key={v}
                onClick={() => { setCalView(v); setCalendarSelected(null) }}
                className={`flex-1 py-1.5 rounded-full text-xs font-semibold border transition-colors
                  ${calView === v
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-gray-600 border-gray-200'
                  }`}
              >
                {v === '3day' ? '3 Days' : v === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>

          {/* Navigation */}
          {(() => {
            // Derive title and nav step based on view
            let title = ''
            if (calView === 'month') {
              title = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            } else if (calView === 'week') {
              const sow = new Date(calendarMonth)
              sow.setDate(calendarMonth.getDate() - calendarMonth.getDay())
              const eow = new Date(sow); eow.setDate(sow.getDate() + 6)
              title = `${sow.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${eow.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            } else {
              const end = new Date(calendarMonth); end.setDate(calendarMonth.getDate() + 2)
              title = `${calendarMonth.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            }
            const goBack = () => {
              setCalendarMonth(m => {
                const d = new Date(m)
                if (calView === 'month') d.setMonth(d.getMonth() - 1)
                else if (calView === 'week') d.setDate(d.getDate() - 7)
                else d.setDate(d.getDate() - 3)
                return d
              })
              setCalendarSelected(null)
            }
            const goFwd = () => {
              setCalendarMonth(m => {
                const d = new Date(m)
                if (calView === 'month') d.setMonth(d.getMonth() + 1)
                else if (calView === 'week') d.setDate(d.getDate() + 7)
                else d.setDate(d.getDate() + 3)
                return d
              })
              setCalendarSelected(null)
            }
            return (
              <div className="flex items-center justify-between mb-4">
                <button onClick={goBack} className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 text-lg font-light">‹</button>
                <span className="text-sm font-bold text-gray-800">{title}</span>
                <button onClick={goFwd} className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 text-lg font-light">›</button>
              </div>
            )
          })()}

          {/* ── MONTH VIEW ──────────────────────────────────────────────── */}
          {calView === 'month' && (
            <>
              <div className="grid grid-cols-7 mb-1">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-x-0.5 gap-y-1">
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={`blank-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1
                  const dateStr = `${calYear}-${String(calMonthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const dayAppts = apptsByDate[dateStr] || []
                  const isToday = dateStr === today
                  const isSelected = dateStr === calendarSelected
                  return (
                    <button
                      key={day}
                      onClick={() => setCalendarSelected(isSelected ? null : dateStr)}
                      className={`flex flex-col items-start p-0.5 rounded-lg text-left transition-colors min-h-[52px] border
                        ${isSelected ? 'bg-sky-50 border-sky-300 ring-2 ring-sky-400' : isToday ? 'bg-sky-50 border-sky-200' : 'border-gray-100 hover:bg-gray-50 hover:border-gray-200'}`}
                    >
                      <span className={`text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full mb-0.5 self-center
                        ${isToday ? 'bg-sky-500 text-white' : isSelected ? 'text-sky-600' : 'text-gray-600'}`}>
                        {day}
                      </span>
                      {dayAppts.slice(0, 3).map((a, idx) => {
                        const timeStr = formatTime(a.appointment_time).replace(':00', '').replace(' AM', 'a').replace(' PM', 'p')
                        const svcLabel = serviceMap[a.service] ?? a.service
                        const svcShort = a.service === 'bath_brush' ? 'B&B' : a.service === 'asian_fusion' ? 'AF' : a.service === 'simply_cute' ? 'SC' : svcLabel.slice(0, 3).toUpperCase()
                        const chipColor = a.service === 'bath_brush' ? 'bg-teal-100 text-teal-700' : a.service === 'asian_fusion' ? 'bg-pink-100 text-pink-700' : a.service === 'simply_cute' ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-600'
                        return (
                          <span key={idx} className={`w-full text-[10px] font-semibold rounded px-0.5 py-px mb-px truncate leading-tight ${chipColor}`}>
                            {timeStr} {svcShort}
                          </span>
                        )
                      })}
                      {dayAppts.length > 3 && <span className="text-[10px] text-gray-400 font-medium px-0.5">+{dayAppts.length - 3}</span>}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* ── WEEK VIEW ───────────────────────────────────────────────── */}
          {calView === 'week' && (() => {
            const sow = new Date(calendarMonth)
            sow.setDate(calendarMonth.getDate() - calendarMonth.getDay())
            const weekDays = Array.from({ length: 7 }, (_, i) => {
              const d = new Date(sow); d.setDate(sow.getDate() + i); return d
            })
            const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
            return (
              <div className="flex gap-1 mb-2">
                {weekDays.map((d, i) => {
                  const dateStr = d.toISOString().split('T')[0]
                  const dayAppts = apptsByDate[dateStr] || []
                  const isToday = dateStr === today
                  const isSelected = dateStr === calendarSelected
                  return (
                    <button
                      key={i}
                      onClick={() => setCalendarSelected(isSelected ? null : dateStr)}
                      className={`flex-1 flex flex-col items-center py-2 px-0.5 rounded-xl transition-colors
                        ${isSelected ? 'bg-sky-50 ring-2 ring-sky-400' : isToday ? 'bg-sky-50' : 'bg-white border border-gray-100 hover:bg-gray-50'}`}
                    >
                      <span className="text-[10px] font-semibold text-gray-400 mb-0.5">{dayNames[d.getDay()]}</span>
                      <span className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full
                        ${isToday ? 'bg-sky-500 text-white' : isSelected ? 'text-sky-600' : 'text-gray-700'}`}>
                        {d.getDate()}
                      </span>
                      <div className="flex flex-wrap justify-center gap-0.5 mt-1.5">
                        {dayAppts.slice(0, 3).map((a, idx) => {
                          const dotColor = a.service === 'bath_brush' ? 'bg-teal-400' : a.service === 'asian_fusion' ? 'bg-pink-400' : 'bg-sky-400'
                          return <span key={idx} className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                        })}
                        {dayAppts.length > 3 && <span className="text-[8px] text-gray-400 leading-none">+{dayAppts.length - 3}</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })()}

          {/* ── 3-DAY VIEW ──────────────────────────────────────────────── */}
          {calView === '3day' && (() => {
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
            const threeDays = Array.from({ length: 3 }, (_, i) => {
              const d = new Date(calendarMonth); d.setDate(calendarMonth.getDate() + i); return d
            })
            return (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {threeDays.map((d, i) => {
                  const dateStr = d.toISOString().split('T')[0]
                  const dayAppts = apptsByDate[dateStr] || []
                  const isToday = dateStr === today
                  const isSelected = dateStr === calendarSelected
                  return (
                    <button
                      key={i}
                      onClick={() => setCalendarSelected(isSelected ? null : dateStr)}
                      className={`flex flex-col items-start p-2 rounded-xl transition-colors min-h-[110px]
                        ${isSelected ? 'bg-sky-50 ring-2 ring-sky-400' : isToday ? 'bg-sky-50' : 'bg-white border border-gray-100 hover:bg-gray-50'}`}
                    >
                      <div className="flex items-center justify-between w-full mb-1.5">
                        <span className="text-[10px] font-semibold text-gray-400">{dayNames[d.getDay()]}</span>
                        <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full
                          ${isToday ? 'bg-sky-500 text-white' : isSelected ? 'text-sky-600' : 'text-gray-700'}`}>
                          {d.getDate()}
                        </span>
                      </div>
                      {dayAppts.slice(0, 4).map((a, idx) => {
                        const timeStr = formatTime(a.appointment_time).replace(':00', '').replace(' AM', 'a').replace(' PM', 'p')
                        const svcLabel = serviceMap[a.service] ?? a.service
                        const svcShort = a.service === 'bath_brush' ? 'B&B' : a.service === 'asian_fusion' ? 'AF' : a.service === 'simply_cute' ? 'SC' : svcLabel.slice(0, 3).toUpperCase()
                        const chipColor = a.service === 'bath_brush' ? 'bg-teal-100 text-teal-700' : a.service === 'asian_fusion' ? 'bg-pink-100 text-pink-700' : a.service === 'simply_cute' ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-600'
                        return (
                          <span key={idx} className={`w-full text-[10px] font-semibold rounded px-0.5 py-px mb-0.5 truncate leading-tight ${chipColor}`}>
                            {timeStr} {svcShort}
                          </span>
                        )
                      })}
                      {dayAppts.length > 4 && <span className="text-[10px] text-gray-400 font-medium">+{dayAppts.length - 4}</span>}
                    </button>
                  )
                })}
              </div>
            )
          })()}

          {/* Legend */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className="flex items-center gap-1 text-[11px] text-gray-500"><span className="w-2.5 h-2.5 rounded bg-sky-100 border border-sky-300 inline-block"/>SC</span>
            <span className="flex items-center gap-1 text-[11px] text-gray-500"><span className="w-2.5 h-2.5 rounded bg-teal-100 border border-teal-300 inline-block"/>B&B</span>
            <span className="flex items-center gap-1 text-[11px] text-gray-500"><span className="w-2.5 h-2.5 rounded bg-pink-100 border border-pink-300 inline-block"/>AF</span>
          </div>

          {/* Selected day — time-slot view */}
          {calendarSelected && (
            <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Day header */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-bold text-gray-800">
                  {new Date(calendarSelected + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric',
                  })}
                </p>
                <button onClick={() => setCalendarSelected(null)} className="text-gray-400 text-lg leading-none">×</button>
              </div>

              {selectedDayAppts.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No appointments this day</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {TIME_OPTIONS.filter(slot =>
                    selectedDayAppts.some(a => a.appointment_time === slot)
                  ).map(slot => {
                    const appt = selectedDayAppts.find(a => a.appointment_time === slot)!
                    return (
                      <button
                        key={slot}
                        onClick={() => openApptPopup(appt)}
                        className="w-full flex items-stretch min-h-[64px] text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                      >
                        {/* Time column */}
                        <div className="w-16 flex-shrink-0 flex items-center justify-end pr-3 py-3">
                          <span className="text-xs font-semibold text-gray-400">{slot}</span>
                        </div>
                        {/* Appointment card */}
                        <div className={`flex-1 border-l border-gray-100 my-2 mr-3 rounded-xl px-3 py-2 flex items-center gap-3 ${
                          appt.service === 'simply_cute' ? 'bg-sky-50 border border-sky-200' :
                          appt.service === 'bath_brush'  ? 'bg-teal-50 border border-teal-200' :
                          appt.service === 'asian_fusion'? 'bg-pink-50 border border-pink-200' :
                          'bg-gray-50 border border-gray-200'
                        }`}>
                          {appt.pets?.photo_url
                            ? <img src={appt.pets.photo_url} className="w-10 h-10 rounded-full object-cover flex-shrink-0" alt="" />
                            : <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-xl flex-shrink-0">🐾</div>
                          }
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-800 text-sm truncate">{appt.pets?.name}{appt.payment_amount ? <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white text-[10px] font-bold leading-none">$</span> : null}</p>
                            <p className="text-xs text-gray-500 truncate">{serviceMap[appt.service] ?? appt.service}</p>
                            {appt.clients?.name && <p className="text-xs text-gray-400 truncate">{appt.clients.name}</p>}
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                            appt.status === 'pending'   ? 'bg-amber-100 text-amber-700' :
                            appt.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
                            appt.status === 'completed' ? 'bg-gray-100 text-gray-500' :
                            'bg-red-100 text-red-500'
                          }`}>{appt.status}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* EARNINGS TAB                                                       */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'earnings' && (
        <div className="px-4 pt-5 pb-4 space-y-4">
          <h2 className="text-xl font-bold text-gray-800">My Earnings</h2>

          {/* Payroll period info */}
          {(() => {
            const fmtDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            const payday = (endStr: string) => {
              const d = new Date(endStr + 'T12:00:00'); d.setDate(d.getDate() + 6)
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }
            return (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-100 border border-gray-200 rounded-2xl px-3 py-2.5">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">This Pay Period</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">
                    {fmtDate(thisPayrollStartStr)} – {fmtDate(thisPayrollEndStr)}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">💰 Payday: {payday(thisPayrollEndStr)}</p>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-2xl px-3 py-2.5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Next Pay Period</p>
                  <p className="text-sm font-bold text-gray-600 mt-0.5">
                    {fmtDate(nextPayrollStartStr)} – {fmtDate(nextPayrollEndStr)}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">🗓️ Payday: {payday(nextPayrollEndStr)}</p>
                </div>
              </div>
            )
          })()}

          {/* Range selector */}
          <div className="grid grid-cols-5 gap-1.5">
            {(['today', 'next_payroll', 'this_payroll', 'last_payroll', 'month'] as const).map(r => (
              <button
                key={r}
                onClick={() => setEarningsRange(r)}
                className={`py-1.5 rounded-full text-xs font-semibold border transition-colors
                  ${earningsRange === r
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-gray-600 border-gray-200'
                  }`}
              >
                {rangeLabelMap[r]}
              </button>
            ))}
          </div>

          {/* Revenue & Commission */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-sky-50 rounded-2xl p-4 border border-sky-100">
              <p className="text-xl font-bold text-sky-700">${totalRevenue.toFixed(2)}</p>
              <p className="text-xs text-sky-600 font-medium mt-1">Service Revenue</p>
              <p className="text-xs text-sky-400 mt-0.5">{paidAppts.length} appt{paidAppts.length !== 1 ? 's' : ''}{cashPendingCount > 0 ? ` · ${cashPendingCount} cash pending` : ''}{totalDiscount > 0 ? ' · before discount' : ''}</p>
            </div>
            <div className="bg-violet-50 rounded-2xl p-4 border border-violet-100">
              <p className="text-xl font-bold text-violet-700">${commission.toFixed(2)}</p>
              <p className="text-xs text-violet-600 font-medium mt-1">Commission</p>
              <p className="text-xs text-violet-400 mt-0.5">{commissionPct}% before discount</p>
            </div>
          </div>

          {/* Revenue breakdown */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Revenue Breakdown</p>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Original price (before discount)</span>
              <span className="font-semibold text-gray-700">${grossRevenue.toFixed(2)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-pink-500">Discounts given</span>
                <span className="font-semibold text-pink-500">−${totalDiscount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t border-gray-100 pt-1.5">
              <span className="text-gray-500">Collected by salon</span>
              <span className="font-semibold text-gray-700">${netCollected.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-gray-100 pt-1.5">
              <span className="text-violet-600 font-semibold">Your commission ({commissionPct}% × ${grossRevenue.toFixed(2)})</span>
              <span className="font-bold text-violet-700">${commission.toFixed(2)}</span>
            </div>
            {totalDiscount > 0 && <p className="text-[11px] text-gray-400 pt-1">Your commission is {commissionPct}% of the full price before any discount.</p>}
          </div>

          {/* Tips — groomer gets tipPct%, store keeps the rest */}
          <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-emerald-800">Total Tips</p>
              <p className="text-xl font-bold text-emerald-700">${totalTips.toFixed(2)}</p>
            </div>
            <div className="flex items-center justify-between bg-white rounded-xl px-3 py-2">
              <div>
                <p className="text-xs font-semibold text-gray-700">Your Share ({tipPct}%)</p>
                <p className="text-xs text-gray-400">Added to your paycheck</p>
              </div>
              <p className="text-base font-bold text-emerald-700">${tipInPaycheck.toFixed(2)}</p>
            </div>
          </div>

          {/* Take-home total */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700">Take-Home Total</p>
                <p className="text-xs text-gray-400">
                  {earningsRange === 'this_payroll'
                    ? `${thisPayrollStartStr} – ${thisPayrollEndStr}`
                    : earningsRange === 'next_payroll'
                    ? `${nextPayrollStartStr} – ${nextPayrollEndStr}`
                    : earningsRange === 'last_payroll'
                    ? `${lastPayrollStartStr} – ${lastPayrollEndStr}`
                    : rangeLabelMap[earningsRange]}
                </p>
              </div>
              <p className="text-2xl font-bold text-gray-800">${(commission + tipInPaycheck).toFixed(2)}</p>
            </div>
          </div>

          {paidAppts.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-2">No completed appointments in this period.</p>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* RESCHEDULE MODAL                                                   */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {rescheduleAppt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRescheduleAppt(null)} />
          <div className="relative bg-white rounded-t-3xl w-full max-w-lg px-5 pt-5 pb-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Handle bar */}
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

            <h3 className="text-base font-bold text-gray-800 mb-0.5">🔄 Reschedule Appointment</h3>
            <p className="text-xs text-gray-400 mb-4">
              {rescheduleAppt.pets?.name} · {rescheduleAppt.appointment_time} · {rescheduleAppt.appointment_date}
            </p>

            {/* Date picker */}
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">New Date</p>
            <input
              type="date"
              value={rescheduleDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={async e => {
                const d = e.target.value
                setRescheduleDate(d)
                setRescheduleTime('')
                if (d) {
                  const res = await fetch(`/api/slots?date=${d}&t=${Date.now()}`)
                  const data = await res.json()
                  setRescheduleSlots(Array.isArray(data.slots) ? data.slots : [])
                }
              }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />

            {/* Time picker — available slots */}
            {rescheduleDate && (
              <>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">New Time</p>
                {rescheduleSlots.length === 0 ? (
                  <p className="text-sm text-gray-400 italic mb-4">No available slots on this date.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {rescheduleSlots.map(t => (
                      <button
                        key={t}
                        onClick={() => setRescheduleTime(t)}
                        className={`py-2 text-sm font-medium rounded-xl border-2 transition-all ${
                          rescheduleTime === t
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'border-gray-100 text-gray-700 hover:border-amber-300'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Confirm button */}
            <button
              disabled={!rescheduleDate || !rescheduleTime || rescheduleLoading}
              onClick={async () => {
                if (!rescheduleDate || !rescheduleTime) return
                setRescheduleLoading(true)
                try {
                  const res = await fetch(`/api/admin/appointments/${rescheduleAppt.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'reschedule', appointment_date: rescheduleDate, appointment_time: rescheduleTime }),
                  })
                  if (res.ok) {
                    showToast('✓ Appointment rescheduled!')
                    setAppointments(prev => prev.map(a =>
                      a.id === rescheduleAppt.id
                        ? { ...a, appointment_date: rescheduleDate, appointment_time: rescheduleTime, status: 'pending', groomer_confirmed: false }
                        : a
                    ))
                    setRescheduleAppt(null)
                  } else {
                    showToast('Failed to reschedule')
                  }
                } catch { showToast('Failed to reschedule') }
                finally { setRescheduleLoading(false) }
              }}
              className="w-full py-3 rounded-2xl text-sm font-bold bg-amber-500 text-white disabled:opacity-40 active:bg-amber-600 transition-colors"
            >
              {rescheduleLoading ? 'Saving…' : rescheduleDate && rescheduleTime ? `Confirm — ${rescheduleTime} on ${rescheduleDate}` : 'Pick a date & time above'}
            </button>

            <button
              onClick={() => setRescheduleAppt(null)}
              className="w-full mt-2 py-2.5 rounded-2xl text-sm font-semibold text-gray-500 bg-gray-100 active:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* CLIENT PROFILE MODAL                                               */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {selectedAppt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => closeApptPopup()} />
          {/* Sheet */}
          <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            {/* Header */}
            <div className={`px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0 ${
              selectedAppt.service === 'simply_cute' ? 'bg-sky-50'
              : selectedAppt.service === 'bath_brush' ? 'bg-teal-50'
              : selectedAppt.service === 'asian_fusion' ? 'bg-pink-50'
              : 'bg-gray-50'
            }`}>
              <div>
                <h3 className="font-bold text-gray-800 text-base">{selectedAppt.pets?.name ?? 'Appointment'}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {formatDate(selectedAppt.appointment_date)} · {formatTime(selectedAppt.appointment_time)}
                </p>
              </div>
              <button onClick={() => closeApptPopup()}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/70 text-gray-500 text-lg font-light hover:bg-white">×</button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-4 space-y-4">

              {/* ── Add-on Services ── */}
              {selectedAppt && (() => {
                const existingAddons = (selectedAppt.notes_list ?? []).filter(n => n.is_addon)
                const existingNames = new Set(existingAddons.map(n => n.text))
                const presetChips = serviceDefs.filter(s => s.id !== selectedAppt.service && s.visible !== false && !existingNames.has(s.name))
                return (
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 mb-1">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">🐾 Add-on Services</p>
                    {existingAddons.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {existingAddons.map((addon, i) => (
                          <div key={addon.id ?? i} className="flex items-center justify-between bg-emerald-50 rounded-xl px-3 py-1.5">
                            <span className="text-sm text-gray-700">{addon.text}</span>
                            <div className="flex items-center gap-2">
                              {addon.price && <span className="text-sm font-semibold text-emerald-600">${addon.price}</span>}
                              <button onClick={() => removeAddonGroomer(selectedAppt.id, addon.id!)}
                                className="text-gray-400 hover:text-red-400 text-xs leading-none">✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {presetChips.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {presetChips.map(s => (
                          <button key={s.id}
                            disabled={savingAddonId === selectedAppt.id}
                            onClick={() => addAddonQuick(selectedAppt.id, s.name, s.tiers?.find((t: {price:string}) => t.price)?.price ?? '')}
                            className="text-xs bg-white border border-gray-200 hover:border-sky-300 hover:bg-sky-50 text-gray-600 hover:text-sky-700 px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40">
                            + {s.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <input
                        value={addonDraft[selectedAppt.id]?.text ?? ''}
                        onChange={e => setAddonDraft(prev => ({ ...prev, [selectedAppt.id]: { text: e.target.value, price: prev[selectedAppt.id]?.price ?? '' } }))}
                        onKeyDown={e => e.key === 'Enter' && addAddonCustom(selectedAppt.id)}
                        placeholder="Custom add-on…"
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                      />
                      <input
                        value={addonDraft[selectedAppt.id]?.price ?? ''}
                        onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setAddonDraft(prev => ({ ...prev, [selectedAppt.id]: { text: prev[selectedAppt.id]?.text ?? '', price: v } })) }}
                        placeholder="$" type="text" inputMode="numeric"
                        className="w-14 border border-gray-200 rounded-xl px-2 py-1.5 text-sm text-center bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                      />
                      <button onClick={() => addAddonCustom(selectedAppt.id)}
                        disabled={savingAddonId === selectedAppt.id || !addonDraft[selectedAppt.id]?.text?.trim()}
                        className="px-3 py-1.5 bg-sky-500 text-white text-sm font-bold rounded-xl disabled:opacity-40">
                        {savingAddonId === selectedAppt.id ? '…' : '+'}
                      </button>
                    </div>
                  </div>
                )
              })()}

              {/* ── Service & Pricing card (admin-desk style) ── */}
              {(() => {
                const svcDef = serviceDefs.find(s => s.id === popupServiceVal)
                const svcName = svcDef?.name ?? serviceMap[popupServiceVal] ?? popupServiceVal
                const tiers = (svcDef?.tiers ?? []).filter(t => t.label)
                const otherServices = serviceDefs.filter(s => s.id !== popupServiceVal && s.visible !== false)
                const addOnTotal = popupAddOns.reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0)
                const baseAmt = parseFloat(popupBasePrice) || 0
                const subtotal = baseAmt + addOnTotal
                const selectedCoupon = availableCoupons.find(c => c.id === popupCouponId) ?? null
                const discountAmt = selectedCoupon
                  ? selectedCoupon.discount_type === 'percent'
                    ? Math.round(subtotal * selectedCoupon.discount_value / 100 * 100) / 100
                    : Math.min(selectedCoupon.discount_value, subtotal)
                  : popupDiscount ? Math.round(subtotal * 0.20 * 100) / 100 : 0
                const grandTotal = subtotal - discountAmt

                return (
                  <div className="rounded-2xl p-4 border border-gray-200 bg-white">
                    {/* Header: service name + payment badge + change button */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-gray-800">{svcName}</p>
                        {popupChangingService ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              defaultValue=""
                              onChange={async e => {
                                const newId = e.target.value
                                if (!newId || !selectedAppt) return
                                setSavingPopupServiceChange(true)
                                const res = await fetch(`/api/admin/appointments/${selectedAppt.id}`, {
                                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'change-service', service: newId }),
                                })
                                if (res.ok) {
                                  const updated = { ...selectedAppt, service: newId }
                                  setSelectedAppt(updated)
                                  setAppointments(prev => prev.map(a => a.id === selectedAppt.id ? updated : a))
                                  setPopupServiceVal(newId)
                                  setPopupBasePrice('')
                                  showToast('✓ Service updated')
                                }
                                setSavingPopupServiceChange(false)
                                setPopupChangingService(false)
                              }}
                              className="text-xs border border-sky-300 rounded-lg px-2 py-1 bg-white focus:outline-none"
                            >
                              <option value="" disabled>Select service…</option>
                              {serviceDefs.filter(s => s.visible !== false).map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                            <button onClick={() => setPopupChangingService(false)} className="text-xs text-gray-400">✕</button>
                          </div>
                        ) : (
                          <button onClick={() => setPopupChangingService(true)}
                            className="text-xs text-gray-400 hover:text-sky-600 font-medium border border-gray-200 hover:border-sky-300 px-2 py-0.5 rounded-lg transition-colors">
                            {savingPopupServiceChange ? '…' : '🔄 Change'}
                          </button>
                        )}
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        selectedAppt.payment_status === 'paid'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {selectedAppt.payment_status === 'paid' ? `✓ Paid${selectedAppt.payment_amount ? ` · $${selectedAppt.payment_amount}` : ''}` : 'Unpaid'}
                      </span>
                    </div>

                    {/* Size tier buttons */}
                    {tiers.length > 0 && (
                      <>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Select Size</p>
                        <div className={`grid gap-2 mb-3 ${tiers.length <= 2 ? 'grid-cols-2' : tiers.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                          {tiers.map((tier, i) => {
                            const explicitMatch = !!popupBaseTier && popupBaseTier === tier.label && !!tier.price
                            // On reopen the chosen tier label isn't saved; highlight when the price uniquely matches one tier.
                            const uniquePriceMatch = !!tier.price && !popupBaseTier && popupBasePrice === tier.price
                              && tiers.filter(t => t.price === tier.price).length === 1
                            const isSelected = explicitMatch || uniquePriceMatch
                            return (
                              <button key={i}
                                onClick={() => { if (tier.price) { setPopupBasePrice(isSelected ? '' : tier.price); setPopupBaseTier(isSelected ? '' : tier.label); setPopupTotalSaved(false) } }}
                                disabled={!tier.price}
                                className={`flex flex-col items-center justify-center rounded-2xl py-3.5 px-2 border-2 transition-all active:scale-95 ${
                                  isSelected
                                    ? 'bg-emerald-500 border-emerald-500 shadow-md'
                                    : tier.price
                                      ? 'bg-white border-gray-200 hover:border-emerald-300 hover:bg-emerald-50'
                                      : 'bg-gray-50 border-gray-100 opacity-40 cursor-default'
                                }`}>
                                <span className={`text-xs font-semibold leading-tight text-center ${isSelected ? 'text-emerald-100' : 'text-gray-500'}`}>
                                  {tier.label}
                                </span>
                                <span className={`text-2xl font-black leading-tight mt-0.5 ${isSelected ? 'text-white' : tier.price ? 'text-gray-800' : 'text-gray-300'}`}>
                                  {tier.price ? `$${tier.price}` : '—'}
                                </span>
                                {tier.duration && (
                                  <span className={`text-[10px] leading-none mt-0.5 ${isSelected ? 'text-emerald-100' : 'text-gray-400'}`}>
                                    ⏱ {tier.duration}
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}

                    {/* Custom price input */}
                    {popupBasePrice && !popupBaseTier && !selectedAppt.payment_amount && (
                      <p className="text-[11px] text-sky-500 font-medium mb-1 px-1">📋 Last payment — confirm or adjust before saving</p>
                    )}
                    {popupBasePrice && !popupBaseTier && selectedAppt.payment_amount && popupTotalSaved && (
                      <p className="text-[11px] text-emerald-600 font-medium mb-1 px-1">✓ Price saved — tap to update if needed</p>
                    )}
                    <div className={`flex items-center rounded-2xl border-2 overflow-hidden mb-3 transition-all ${
                      popupBasePrice && !popupBaseTier
                        ? 'border-emerald-400 bg-emerald-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}>
                      <span className={`text-base font-black px-4 py-3 border-r-2 ${
                        popupBasePrice && !popupBaseTier
                          ? 'border-emerald-300 text-emerald-600'
                          : 'border-gray-200 text-gray-400'
                      }`}>$</span>
                      <input
                        type="text" inputMode="numeric" pattern="[0-9]*"
                        placeholder={tiers.length > 0 ? 'or enter custom…' : 'enter price…'}
                        value={popupBaseTier ? '' : popupBasePrice}
                        onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setPopupBasePrice(v); setPopupBaseTier(''); setPopupTotalSaved(false) }}
                        onFocus={() => { if (popupBaseTier) { setPopupBasePrice(''); setPopupTotalSaved(false) } }}
                        className={`flex-1 text-xl font-black py-3 px-4 bg-transparent focus:outline-none placeholder:text-gray-300 ${
                          popupBasePrice && !popupBaseTier ? 'text-emerald-700' : 'text-gray-700'
                        }`}
                      />
                    </div>

                    {/* Add-on Services */}
                    {(otherServices.length > 0 || popupAddOns.length > 0) && (
                      <div className="border-t border-gray-100 pt-3 mt-1 mb-3">
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Add-on Services</p>

                        {/* Selected add-ons */}
                        {popupAddOns.length > 0 && (
                          <div className="space-y-2 mb-2">
                            {popupAddOns.map(addon => (
                              <div key={addon.id} className="flex items-center gap-2 bg-sky-50 border-2 border-sky-200 rounded-2xl px-4 py-2.5">
                                <span className="text-sm font-bold text-sky-800 flex-1">{addon.name}</span>
                                <div className={`flex items-center rounded-xl border-2 border-sky-300 bg-white overflow-hidden`}>
                                  <span className="text-sm font-black px-3 py-1.5 border-r-2 border-sky-200 text-sky-500">$</span>
                                  <input
                                    type="number" min="0" step="1"
                                    value={addon.price}
                                    onChange={e => { setPopupAddOns(prev => prev.map(a => a.id === addon.id ? { ...a, price: e.target.value } : a)); setPopupTotalSaved(false) }}
                                    className="w-14 text-base font-black text-sky-700 bg-transparent focus:outline-none text-center py-1.5 px-2"
                                  />
                                </div>
                                <button onClick={() => { setPopupAddOns(prev => prev.filter(a => a.id !== addon.id)); setPopupTotalSaved(false) }}
                                  className="w-7 h-7 rounded-full bg-rose-100 hover:bg-rose-200 text-rose-400 hover:text-rose-600 flex items-center justify-center text-sm font-bold transition-colors">✕</button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Available add-on chips */}
                        <div className="flex flex-wrap gap-1.5">
                          {otherServices
                            .filter(s => !popupAddOns.find(a => a.id === s.id))
                            .map(s => (
                              <button key={s.id}
                                onClick={() => {
                                  const defaultPrice = s.tiers?.find(t => t.price)?.price ?? ''
                                  setPopupAddOns(prev => [...prev, { id: s.id, name: s.name ?? serviceMap[s.id] ?? s.id, price: defaultPrice }])
                                  setPopupTotalSaved(false)
                                }}
                                className="text-xs bg-white border-2 border-gray-200 hover:border-sky-300 hover:bg-sky-50 text-gray-600 hover:text-sky-700 px-3 py-1.5 rounded-full font-semibold transition-colors">
                                + {s.name ?? serviceMap[s.id] ?? s.id}
                              </button>
                            ))
                          }
                        </div>
                      </div>
                    )}

                    {/* Coupon / Discount selector */}
                    {subtotal > 0 && (
                      <div className="mb-3">
                        {availableCoupons.length > 0 ? (
                          <div className={`rounded-2xl border-2 transition-all overflow-hidden ${popupCouponId ? 'border-pink-300 bg-pink-50' : 'border-gray-200 bg-gray-50'}`}>
                            <div className="flex items-center px-4 py-2.5 gap-3">
                              <span className="text-sm">🎟️</span>
                              <select
                                value={popupCouponId ?? ''}
                                onChange={e => { setPopupCouponId(e.target.value || null); setPopupDiscount(false); setPopupTotalSaved(false) }}
                                className={`flex-1 text-sm font-semibold bg-transparent focus:outline-none ${popupCouponId ? 'text-pink-700' : 'text-gray-400'}`}
                              >
                                <option value="">Apply coupon…</option>
                                {availableCoupons.map(c => {
                                  const blocked = c.first_visit_only && !popupIsFirstTime
                                  return (
                                    <option key={c.id} value={c.id} disabled={blocked}>
                                      {c.name} — {c.discount_type === 'percent' ? `${c.discount_value}% off` : `$${c.discount_value} off`}
                                      {c.code ? ` (${c.code})` : ''}{blocked ? ' · first visit only' : ''}
                                    </option>
                                  )
                                })}
                              </select>
                              {popupCouponId && (
                                <button onClick={() => { setPopupCouponId(null); setPopupTotalSaved(false) }}
                                  className="text-pink-400 hover:text-pink-600 text-lg leading-none">✕</button>
                              )}
                            </div>
                          </div>
                        ) : (
                          // Fallback: no coupons configured — show manual 20% toggle
                          <button
                            onClick={() => { setPopupDiscount(d => !d); setPopupTotalSaved(false) }}
                            className={`w-full flex items-center justify-between rounded-2xl px-4 py-2.5 border-2 transition-all ${
                              popupDiscount
                                ? 'bg-pink-50 border-pink-300 text-pink-700'
                                : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-pink-200 hover:text-pink-500'
                            }`}>
                            <span className="font-bold text-sm">🎉 First-time customer 20% off</span>
                            <span className={`text-xs font-black px-2.5 py-1 rounded-full ${popupDiscount ? 'bg-pink-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                              {popupDiscount ? 'ON' : 'OFF'}
                            </span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Total breakdown */}
                    {(popupBasePrice || popupAddOns.length > 0) && (
                      <div className="bg-gray-50 rounded-2xl border border-gray-100 px-4 py-3 mb-3 space-y-1.5">
                        {popupBasePrice && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-500">{svcName}</span>
                            <span className="font-bold text-gray-700">${popupBasePrice}</span>
                          </div>
                        )}
                        {popupAddOns.map(a => (
                          <div key={a.id} className="flex justify-between items-center text-sm">
                            <span className="text-gray-500">{a.name}</span>
                            <span className="font-bold text-gray-700">${a.price || '0'}</span>
                          </div>
                        ))}
                        {discountAmt > 0 && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-pink-500 font-semibold">
                              🎟️ {selectedCoupon ? selectedCoupon.name : '20% discount'}
                              {selectedCoupon?.discount_type === 'percent' ? ` (${selectedCoupon.discount_value}%)` : selectedCoupon?.discount_type === 'fixed' ? ` ($${selectedCoupon.discount_value} off)` : ''}
                            </span>
                            <span className="font-bold text-pink-500">−${discountAmt.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                          <span className="font-bold text-gray-800">Total</span>
                          <div className="text-right">
                            {popupDiscount && subtotal > 0 && (
                              <span className="text-xs text-gray-400 line-through mr-2">${subtotal.toFixed(2)}</span>
                            )}
                            <span className={`text-xl font-black ${popupTotalSaved && grandTotal > 0 ? 'text-emerald-600' : popupDiscount ? 'text-pink-600' : 'text-gray-700'}`}>${grandTotal.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Save Total button */}
                    <button
                      disabled={grandTotal <= 0 || savingPopupPayment}
                      onClick={async () => {
                        if (!selectedAppt || grandTotal <= 0) return
                        const amount = grandTotal.toString()
                        setSavingPopupPayment(true)
                        try {
                          // Save payment amount + add-ons breakdown
                          const res = await fetch(`/api/admin/appointments/${selectedAppt.id}`, {
                            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              action: 'record-payment', payment_amount: amount, addons: popupAddOns,
                              discount_label: selectedCoupon ? selectedCoupon.name : (popupDiscount && discountAmt > 0 ? 'First-time customer 20% off' : null),
                              discount_percent: selectedCoupon?.discount_type === 'percent' ? String(selectedCoupon.discount_value) : (popupDiscount && discountAmt > 0 ? '20' : null),
                              discount_amount: discountAmt > 0 ? discountAmt.toFixed(2) : null,
                              size_tier: popupBaseTier || null,
                            }),
                          })
                          const data = await res.json()
                          if (data.success) {
                            const addonNotes = popupAddOns.map(a => ({ id: a.id, text: a.name, price: a.price, is_addon: true as const, author: 'system', created_at: new Date().toISOString() }))
                            const nonAddonNotes = (selectedAppt.notes_list ?? []).filter(n => !n.is_addon)
                            const dLabel = selectedCoupon ? selectedCoupon.name : (popupDiscount && discountAmt > 0 ? 'First-time customer 20% off' : null)
                            const dPct = selectedCoupon?.discount_type === 'percent' ? String(selectedCoupon.discount_value) : (popupDiscount && discountAmt > 0 ? '20' : null)
                            const dAmt = discountAmt > 0 ? discountAmt.toFixed(2) : null
                            const updated = { ...selectedAppt, payment_amount: amount, size_tier: popupBaseTier || null, discount_label: dLabel, discount_percent: dPct, discount_amount: dAmt, notes_list: [...nonAddonNotes, ...addonNotes] } as typeof selectedAppt
                            setAppointments(prev => prev.map(a => a.id === selectedAppt.id ? updated : a))
                            setPopupTotalSaved(true)
                            showToast('✓ Total saved!')
                            setTimeout(() => setSelectedAppt(null), 800)
                          } else {
                            showToast('❌ Save failed — please try again')
                          }
                        } catch {
                          showToast('❌ Save failed — check connection')
                        }
                        finally { setSavingPopupPayment(false) }
                      }}
                      className={`w-full py-2.5 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors ${
                        grandTotal <= 0 ? 'bg-gray-300' : popupTotalSaved ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-gray-400 hover:bg-gray-500'
                      }`}>
                      {savingPopupPayment ? '⏳ Saving…' : grandTotal > 0 ? (popupTotalSaved ? `✓ Total · $${grandTotal}` : `💾 Save Total · $${grandTotal}`) : 'Select a size first'}
                    </button>
                  </div>
                )
              })()}

              {/* Pet Info — read-only with edit pencil */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Pet Info</p>
                  {!editingPetInfo && (
                    <button onClick={() => setEditingPetInfo(true)}
                      className="text-xs font-semibold text-gray-400 hover:text-emerald-600 flex items-center gap-1">✏️ Edit</button>
                  )}
                </div>

                {!editingPetInfo ? (
                  <div className="text-sm text-gray-700 space-y-0.5">
                    <p className="font-semibold">{popupPetName || selectedAppt.pets?.name || '—'}</p>
                    <p className="text-gray-500">
                      {popupBreed || <span className="text-gray-300 italic">no breed</span>}
                      <span className="text-gray-300 mx-1.5">·</span>
                      {popupWeight || <span className="text-gray-300 italic">no size</span>}
                    </p>
                  </div>
                ) : (
                  <>
                    <input value={popupPetName} onChange={e => setPopupPetName(e.target.value)} placeholder="Pet name"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                    <div className="flex gap-2 mb-2">
                      <BreedInputG value={popupBreed} onChange={setPopupBreed}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 w-full" />
                      <select value={popupWeight} onChange={e => setPopupWeight(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
                        <option value="">Size…</option>
                        {WEIGHT_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (!selectedAppt.pets?.id) return
                          const newName = popupPetName.trim()
                          setSavingPetInfo(true)
                          await fetch(`/api/admin/pets/${selectedAppt.pets.id}`, {
                            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: newName || undefined, breed: popupBreed || null, weight: popupWeight || null }),
                          })
                          setAppointments(prev => prev.map(a =>
                            a.id === selectedAppt.id ? { ...a, pets: a.pets ? { ...a.pets, name: newName || a.pets.name, breed: popupBreed || null, weight: popupWeight || null } : a.pets } : a
                          ))
                          setSelectedAppt(prev => prev ? { ...prev, pets: prev.pets ? { ...prev.pets, name: newName || prev.pets.name, breed: popupBreed || null, weight: popupWeight || null } : prev.pets } : prev)
                          setSavingPetInfo(false)
                          setEditingPetInfo(false)
                          showToast('✓ Pet info saved')
                        }}
                        disabled={savingPetInfo}
                        className="flex-1 py-2 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors disabled:opacity-40"
                      >
                        {savingPetInfo ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => { setEditingPetInfo(false); setPopupPetName(selectedAppt.pets?.name ?? ''); setPopupBreed(selectedAppt.pets?.breed ?? ''); setPopupWeight(selectedAppt.pets?.weight ?? '') }}
                        disabled={savingPetInfo}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-40"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}

                {/* Tags */}
                {selectedAppt.pets?.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">🏷️ Tags</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {popupPetTags.map(t => (
                        <TagPill
                          key={t.id}
                          tag={t}
                          onRemove={async () => {
                            await fetch('/api/admin/pet-tags', {
                              method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ pet_id: selectedAppt.pets!.id, tag_id: t.id }),
                            })
                            setPopupPetTags(prev => prev.filter(x => x.id !== t.id))
                          }}
                        />
                      ))}
                      <TagPicker
                        petId={selectedAppt.pets.id}
                        currentTags={popupPetTags}
                        onChange={setPopupPetTags}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Owner */}
              <div className="space-y-1 px-1">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Owner</p>
                <p className="font-semibold text-gray-800">{selectedAppt.clients?.name}</p>
              </div>

              {/* Staff Assignment — read-only for groomers */}
              {(selectedAppt.assigned_groomer || selectedAppt.assigned_bather) && (
                <div className="space-y-2 px-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-indigo-400">Staff</p>
                  <div className="flex gap-2 flex-wrap">
                    {selectedAppt.assigned_groomer && (
                      <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
                        <span className="text-xs font-semibold text-indigo-400">✂️ Groomer</span>
                        <span className="text-sm font-semibold text-gray-800">{selectedAppt.assigned_groomer}</span>
                      </div>
                    )}
                    {selectedAppt.assigned_bather && (
                      <div className="flex items-center gap-2 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2">
                        <span className="text-xs font-semibold text-sky-400">🛁 Bather</span>
                        <span className="text-sm font-semibold text-gray-800">{selectedAppt.assigned_bather}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ─── CUSTOMER REQUESTS ─── */}
              {(() => {
                const apptAny = selectedAppt as unknown as { notes?: string | null; notes_english?: string | null; notes_chinese?: string | null }
                const hasCustomerReq = !!(apptAny.notes && apptAny.notes.trim())
                const isEditingCustomerReq = editingPopupNote && noteEditorMode === 'customer-edit'
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-xs font-bold uppercase tracking-widest text-amber-500">📋 Customer Requests</p>
                      {hasCustomerReq && !isEditingCustomerReq && (
                        <button
                          onClick={() => {
                            if (noteTranslateTimerRef.current) clearTimeout(noteTranslateTimerRef.current)
                            noteIsComposingRef.current = false
                            setNoteEditorMode('customer-edit')
                            setEditingPopupNote(true)
                            setPopupNoteText(apptAny.notes || '')
                            setPopupNoteTranslations(null)
                            setTimeout(() => { if (noteInputRef.current) noteInputRef.current.value = apptAny.notes || '' }, 0)
                          }}
                          className="text-xs font-semibold text-amber-600 hover:text-amber-700 px-2.5 py-1 rounded-lg hover:bg-amber-50">✏️ Edit</button>
                      )}
                    </div>
                    {isEditingCustomerReq ? (
                      <div className="bg-white rounded-2xl border border-amber-200 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-gray-700">✏️ Edit Customer Request</p>
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            {translatingPopupNote && <span className="inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />}
                            {translatingPopupNote ? 'Translating…' : popupNoteTranslations ? '✨ Translated' : 'Type in any language'}
                          </span>
                        </div>
                        <textarea
                          ref={noteInputRef}
                          defaultValue={apptAny.notes || ''}
                          onChange={e => { if (!noteIsComposingRef.current) triggerAutoTranslate(e.target.value) }}
                          onCompositionStart={() => { noteIsComposingRef.current = true }}
                          onCompositionEnd={e => { noteIsComposingRef.current = false; triggerAutoTranslate((e.target as HTMLTextAreaElement).value) }}
                          placeholder="What did the customer request?"
                          rows={3}
                          autoFocus
                          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                        />
                        {popupNoteTranslations && (
                          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1.5">
                            <p className="text-xs font-semibold text-amber-600">✨ Will save in all languages</p>
                            {popupNoteTranslations.detected !== 'english' && popupNoteTranslations.english && (
                              <div className="text-xs text-gray-600"><span className="font-semibold text-gray-400">🇺🇸 </span>{popupNoteTranslations.english}</div>
                            )}
                            {popupNoteTranslations.detected !== 'traditional' && popupNoteTranslations.traditional && (
                              <div className="text-xs text-gray-600"><span className="font-semibold text-gray-400">🇹🇼 </span>{popupNoteTranslations.traditional}</div>
                            )}
                            {popupNoteTranslations.detected !== 'simplified' && popupNoteTranslations.simplified && (
                              <div className="text-xs text-gray-600"><span className="font-semibold text-gray-400">🇨🇳 </span>{popupNoteTranslations.simplified}</div>
                            )}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button onClick={saveCustomerRequest} disabled={savingPopupNote || translatingPopupNote}
                            className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
                            {savingPopupNote ? 'Saving…' : translatingPopupNote ? '✨ Translating…' : '💾 Save'}
                          </button>
                          <button onClick={() => { setEditingPopupNote(false); setNoteEditorMode('none'); setPopupNoteTranslations(null); setPopupNoteText(''); if (noteInputRef.current) noteInputRef.current.value = '' }}
                            className="px-4 py-2 text-gray-500 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50">Cancel</button>
                        </div>
                      </div>
                    ) : hasCustomerReq ? (
                      <div className="bg-amber-50/60 rounded-2xl border border-amber-200 overflow-hidden">
                        <div className="px-4 py-3">
                          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-medium">{apptAny.notes}</p>
                          {(apptAny.notes_english || apptAny.notes_chinese) && (
                            <div className="border-t border-amber-100 pt-2 mt-3 space-y-1.5">
                              {apptAny.notes_english && (
                                <div className="flex gap-2 items-start">
                                  <span className="text-base leading-tight flex-shrink-0">🇺🇸</span>
                                  <p className="text-xs text-gray-600 leading-relaxed">{apptAny.notes_english}</p>
                                </div>
                              )}
                              {apptAny.notes_chinese && (
                                <div className="flex gap-2 items-start">
                                  <span className="text-base leading-tight flex-shrink-0">🇹🇼</span>
                                  <p className="text-xs text-gray-600 leading-relaxed">{apptAny.notes_chinese}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          if (noteTranslateTimerRef.current) clearTimeout(noteTranslateTimerRef.current)
                          noteIsComposingRef.current = false
                          setNoteEditorMode('customer-edit'); setEditingPopupNote(true); setPopupNoteText(''); setPopupNoteTranslations(null)
                        }}
                        className="w-full py-2.5 rounded-xl text-xs font-semibold border-2 border-dashed border-amber-200 text-amber-500 hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50">
                        + Add Customer Request
                      </button>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* BOTTOM NAV                                                         */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-40 safe-area-pb">
        <div className="grid grid-cols-4">
          {navItems.map(({ key, label, icon, badge }) => {
            const isActive = activeTab === key
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className="relative flex flex-col items-center pt-2 pb-3 gap-0.5"
              >
                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[3px] bg-sky-500 rounded-b-full" />
                )}
                {/* Icon */}
                <span className={isActive ? 'text-sky-600' : 'text-gray-400'}>
                  {icon}
                </span>
                {/* Label */}
                <span className={`text-xs font-medium leading-none ${isActive ? 'text-sky-600' : 'text-gray-400'}`}>
                  {label}
                </span>
                {/* Badge */}
                {badge !== undefined && badge > 0 && (
                  <span className="absolute top-1 right-5 bg-rose-500 text-white text-[10px] leading-none rounded-full min-w-[16px] h-4 flex items-center justify-center font-bold px-1">
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </nav>

      {/* ── HEALTH CHECK MODAL ────────────────────────────── */}
      {healthCheckAppt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[9999]">
          <div className="bg-white rounded-2xl shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-5">
              <h2 className="text-xl font-bold text-gray-800">Health Check 健康檢查</h2>
              <p className="text-sm text-gray-500 mt-0.5">{healthCheckAppt.pets?.name ?? 'Dog'}</p>
              <p className="text-xs text-gray-400 mt-1">勾選有問題的選項 · Check any issues found</p>
            </div>

            <div className="p-5 space-y-3">
              {/* All-clear / issues-found summary banner */}
              {(() => {
                const total = Object.values(healthChecks).reduce((sum, arr) => sum + arr.length, 0)
                const allSectionsCleared = healthClearSections.size === HEALTH_CHECK_SECTIONS.length
                return total === 0 && !allSectionsCleared ? null : allSectionsCleared && total === 0 ? (
                  <div className="flex items-center gap-3 bg-green-50 border-2 border-green-300 rounded-2xl px-4 py-3">
                    <span className="text-2xl">✅</span>
                    <div>
                      <p className="text-sm font-bold text-green-700">All Normal — No Issues Found</p>
                      <p className="text-xs text-green-600">一切正常，沒有發現問題</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 bg-rose-50 border-2 border-rose-300 rounded-2xl px-4 py-3">
                    <span className="text-2xl">⚠️</span>
                    <div>
                      <p className="text-sm font-bold text-rose-700">{total} Issue{total > 1 ? 's' : ''} Found</p>
                      <p className="text-xs text-rose-600">發現 {total} 個問題</p>
                    </div>
                  </div>
                )
              })()}

              {HEALTH_CHECK_SECTIONS.map(section => {
                const sectionKey = section.key as HealthCheckKey
                const selected = healthChecks[sectionKey]
                const isCleared = healthClearSections.has(sectionKey)
                const hasIssue = selected.length > 0

                const toggleClear = () => {
                  const next = new Set(healthClearSections)
                  if (isCleared) {
                    next.delete(sectionKey)
                  } else {
                    next.add(sectionKey)
                    // Uncheck any issues when marking all clear
                    setHealthChecks(prev => ({ ...prev, [sectionKey]: [] }))
                  }
                  setHealthClearSections(next)
                }

                const toggleIssue = (issueKey: string) => {
                  const current = healthChecks[sectionKey]
                  const next = current.includes(issueKey)
                    ? current.filter(k => k !== issueKey)
                    : [...current, issueKey]
                  setHealthChecks(prev => ({ ...prev, [sectionKey]: next }))
                  // Uncheck "all clear" if an issue is selected
                  if (!current.includes(issueKey)) {
                    const cleared = new Set(healthClearSections)
                    cleared.delete(sectionKey)
                    setHealthClearSections(cleared)
                  }
                }

                return (
                  <div key={section.key} className={`rounded-xl border-2 overflow-hidden transition-all ${hasIssue ? 'border-rose-300' : isCleared ? 'border-green-300' : 'border-gray-100'}`}>
                    {/* Section header */}
                    <div className={`flex items-center gap-2 px-4 py-3 ${hasIssue ? 'bg-rose-100' : isCleared ? 'bg-green-50' : 'bg-gray-100'}`}>
                      <span className="text-lg">{section.emoji}</span>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800 text-sm">{section.label}</p>
                        <p className="text-xs text-gray-500">{section.labelZh}</p>
                      </div>
                      {/* Normal toggle */}
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isCleared}
                          onChange={toggleClear}
                          className="w-4 h-4 accent-green-500 cursor-pointer"
                        />
                        <span className={`text-xs font-semibold ${isCleared ? 'text-green-600' : 'text-gray-400'}`}>
                          {isCleared ? '✓ Normal' : 'Normal'}
                        </span>
                      </label>
                      {hasIssue && (
                        <span className="text-xs font-bold text-rose-600 bg-rose-200 rounded-full px-2 py-0.5 ml-1">
                          {selected.length}
                        </span>
                      )}
                    </div>

                    {/* Issue checkboxes — hidden when marked all clear */}
                    {!isCleared && (
                      <div className="px-4 py-2 space-y-2 bg-white">
                        {section.issues.map(issue => {
                          const checked = selected.includes(issue.key)
                          return (
                            <label key={issue.key} className="flex items-center gap-3 cursor-pointer py-1">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleIssue(issue.key)}
                                className="w-5 h-5 accent-rose-500 cursor-pointer flex-shrink-0"
                              />
                              <div>
                                <p className="text-sm text-gray-800">{issue.en}</p>
                                <p className="text-xs text-gray-500">{issue.zh}</p>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Groomer Notes with AI translation */}
              <div className="pt-2 border-t border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">🏥 Health Concerns / 健康狀況 <span className="text-gray-400 font-normal">(optional)</span></label>
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    {translatingHealthNotes && <span className="inline-block w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />}
                    {translatingHealthNotes ? 'Translating…' : healthNotesTranslations ? '✨ Translated' : 'Type in any language'}
                  </span>
                </div>
                <textarea
                  placeholder="Any observations or concerns... / 任何觀察或問題..."
                  value={groomerNotes}
                  onChange={e => {
                    const text = e.target.value
                    setGroomerNotes(text)
                    // Auto-translate with 800ms debounce
                    if (healthNotesTimerRef.current) clearTimeout(healthNotesTimerRef.current)
                    if (!text.trim()) { setHealthNotesTranslations(null); return }
                    healthNotesTimerRef.current = setTimeout(async () => {
                      setTranslatingHealthNotes(true)
                      try {
                        const res = await fetch('/api/translate', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ text }),
                        })
                        const data = await res.json()
                        if (data.english !== undefined || data.traditional !== undefined) {
                          setHealthNotesTranslations({ english: data.english || '', traditional: data.traditional || '', simplified: data.simplified || '', detected: data.detected || 'unknown' })
                        }
                      } catch { /* silent */ } finally { setTranslatingHealthNotes(false) }
                    }, 800)
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                  rows={3}
                />
                {healthNotesTranslations && (
                  <div className="mt-2 bg-violet-50 border border-violet-100 rounded-xl p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-violet-500">✨ Will save in all languages</p>
                    {healthNotesTranslations.detected !== 'english' && healthNotesTranslations.english && (
                      <div className="text-xs text-gray-600"><span className="font-semibold text-gray-400">🇺🇸 </span>{healthNotesTranslations.english}</div>
                    )}
                    {healthNotesTranslations.detected !== 'traditional' && healthNotesTranslations.traditional && (
                      <div className="text-xs text-gray-600"><span className="font-semibold text-gray-400">🇹🇼 </span>{healthNotesTranslations.traditional}</div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <button onClick={() => { setHealthCheckAppt(null); if (healthNotesTimerRef.current) clearTimeout(healthNotesTimerRef.current) }} className="flex-1 px-4 py-2 text-gray-600 font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
                <button onClick={submitHealthCheck} disabled={submittingHealthCheck} className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors">{submittingHealthCheck ? '⏳ Starting...' : '▶ Start Grooming'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Quality Check Modal ──────────────────────────────────────────────────── */}
      {qualityCheckAppt && (() => {
        const doneCount = Object.values(qualityChecks).filter(Boolean).length
        const total = QUALITY_CHECK_ITEMS.length
        const allDone = doneCount === total
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-3xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">🎯 Grooming Quality Check</h2>
                    <p className="text-sm text-gray-500 mt-0.5">勾選每個檢查好的項目 · {qualityCheckAppt.pets?.name ?? 'Dog'}</p>
                  </div>
                  {/* Progress pill */}
                  <span className={`text-sm font-bold px-3 py-1 rounded-full ${allDone ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {doneCount}/{total}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all duration-300"
                    style={{ width: `${(doneCount / total) * 100}%` }}
                  />
                </div>
              </div>

              <div className="px-6 py-4 space-y-3">
                {/* All-done banner */}
                {allDone && (
                  <div className="flex items-center gap-3 bg-emerald-50 border-2 border-emerald-300 rounded-2xl px-4 py-3">
                    <span className="text-2xl">🎉</span>
                    <div>
                      <p className="text-sm font-bold text-emerald-700">All Done! Ready for Pickup</p>
                      <p className="text-xs text-emerald-600">全部完成，可以通知主人來接了</p>
                    </div>
                  </div>
                )}

                {/* Checklist */}
                <div className="space-y-2">
                  {QUALITY_CHECK_ITEMS.map(item => {
                    const checked = qualityChecks[item.key]
                    return (
                      <label
                        key={item.key}
                        className={`flex items-center gap-4 p-3 rounded-xl border-2 cursor-pointer transition-all ${checked ? 'border-emerald-300 bg-emerald-50' : 'border-gray-100 bg-gray-50 hover:border-emerald-200'}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => setQualityChecks({ ...qualityChecks, [item.key]: e.target.checked })}
                          className="w-5 h-5 accent-emerald-500 cursor-pointer flex-shrink-0"
                        />
                        <span className="text-xl">{item.emoji}</span>
                        <div className="flex-1">
                          <p className={`text-sm font-semibold ${checked ? 'text-emerald-700 line-through decoration-emerald-400' : 'text-gray-800'}`}>{item.en}</p>
                          <p className={`text-xs ${checked ? 'text-emerald-500' : 'text-gray-500'}`}>{item.zh}</p>
                        </div>
                        {checked && <span className="text-emerald-500 text-lg">✓</span>}
                      </label>
                    )
                  })}
                </div>

                {/* Notes section */}
                <div className="pt-2 border-t border-gray-200 space-y-4">
                  {/* Groomer Notes (internal, bilingual) */}
                  <div>
                    <label className="block text-sm font-semibold text-purple-700 mb-1">📓 Groomer Notes / 美容師工作日記 <span className="text-gray-400 font-normal text-xs">internal · 中英文一起 (auto-translated)</span></label>
                    <textarea
                      placeholder="工作日記，內部記錄... / Internal grooming notes (type any language)..."
                      value={groomerDiary}
                      onChange={e => {
                        const val = e.target.value
                        setGroomerDiary(val)
                        setGroomerDiaryTranslations(null)
                        if (groomerDiaryTimerRef.current) clearTimeout(groomerDiaryTimerRef.current)
                        if (val.trim()) {
                          setTranslatingGroomerDiary(true)
                          groomerDiaryTimerRef.current = setTimeout(async () => {
                            try {
                              const r = await fetch('/api/translate', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ text: val }),
                              })
                              const d = await r.json()
                              if (d.english && d.traditional) setGroomerDiaryTranslations(d)
                            } catch {}
                            setTranslatingGroomerDiary(false)
                          }, 800)
                        } else {
                          setTranslatingGroomerDiary(false)
                        }
                      }}
                      className="w-full border border-purple-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none bg-purple-50 placeholder-purple-300"
                      rows={3}
                    />
                    {translatingGroomerDiary && (
                      <p className="text-xs text-gray-400 mt-1 animate-pulse">⏳ Translating...</p>
                    )}
                    {groomerDiaryTranslations && !translatingGroomerDiary && (
                      <div className="mt-2 bg-white border border-purple-100 rounded-xl px-3 py-2 space-y-1">
                        <p className="text-xs text-gray-500"><span className="font-medium text-gray-700">EN:</span> {groomerDiaryTranslations.english}</p>
                        <p className="text-xs text-gray-500"><span className="font-medium text-gray-700">繁:</span> {groomerDiaryTranslations.traditional}</p>
                      </div>
                    )}
                  </div>

                  {/* Note to Customer */}
                  <div>
                    <label className="block text-sm font-semibold text-emerald-700 mb-1">💌 Note to Customer / 給客戶的留言 <span className="text-gray-400 font-normal text-xs">customer gets the English version</span></label>
                    {/* Quick presets — tap to fill (already translated, no waiting). Groomer can still edit or type their own below. */}
                    <div className="grid grid-cols-2 gap-1.5 mb-2">
                      {([
                        { raw: '您的寶貝今天表現非常好，乖巧又聽話，是個小天使！🐾', english: 'Your pup was wonderful today — so well-behaved and sweet, a little angel! 🐾', traditional: '您的寶貝今天表現非常好，乖巧又聽話，是個小天使！🐾', simplified: '您的宝贝今天表现非常好，乖巧又听话，是个小天使！🐾' },
                        { raw: '已經洗香香、剪得美美的，隨時可以接走囉～感謝您選擇我們！', english: 'All freshly bathed and groomed to look adorable — ready for pickup! Thank you for choosing us!', traditional: '已經洗香香、剪得美美的，隨時可以接走囉～感謝您選擇我們！', simplified: '已经洗香香、剪得美美的，随时可以接走啰～感谢您选择我们！' },
                        { raw: '寶貝一開始有點緊張，但整體很配合、表現很棒，期待下次再見！', english: 'Your pup was a little nervous at first but cooperated beautifully and did great. See you next time!', traditional: '寶貝一開始有點緊張，但整體很配合、表現很棒，期待下次再見！', simplified: '宝贝一开始有点紧张，但整体很配合、表现很棒，期待下次再见！' },
                        { raw: '寶貝今天有些部位比較敏感，我們選擇不強迫，讓整個過程保持輕鬆無壓力。請別擔心，我們會在接下來幾次慢慢幫牠完成。', english: "Your pup got a little sensitive around some areas today, so we chose not to push to keep the experience calm and stress-free. Nothing to worry about — we'll work on it gradually over the next few visits.", traditional: '寶貝今天有些部位比較敏感，我們選擇不強迫，讓整個過程保持輕鬆無壓力。請別擔心，我們會在接下來幾次慢慢幫牠完成。', simplified: '宝贝今天有些部位比较敏感，我们选择不强迫，让整个过程保持轻松无压力。请别担心，我们会在接下来几次慢慢帮它完成。' },
                      ] as const).map((p, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            if (customerNoteTimerRef.current) clearTimeout(customerNoteTimerRef.current)
                            setTranslatingCustomerNote(false)
                            setCustomerNote(p.raw)
                            setCustomerNoteTranslations({ english: p.english, traditional: p.traditional, simplified: p.simplified })
                          }}
                          className="text-left text-[11px] leading-snug px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 transition-colors"
                        >
                          {p.english}
                        </button>
                      ))}
                    </div>
                    <textarea
                      placeholder="e.g. Your pup did great today! / 您的狗狗今天表現很棒！"
                      value={customerNote}
                      onChange={e => {
                        const val = e.target.value
                        setCustomerNote(val)
                        setCustomerNoteTranslations(null)
                        if (customerNoteTimerRef.current) clearTimeout(customerNoteTimerRef.current)
                        if (val.trim()) {
                          setTranslatingCustomerNote(true)
                          customerNoteTimerRef.current = setTimeout(async () => {
                            try {
                              const r = await fetch('/api/translate', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ text: val }),
                              })
                              const d = await r.json()
                              if (d.english && d.traditional) setCustomerNoteTranslations(d)
                            } catch {}
                            setTranslatingCustomerNote(false)
                          }, 800)
                        } else {
                          setTranslatingCustomerNote(false)
                        }
                      }}
                      className="w-full border border-emerald-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none bg-emerald-50 placeholder-emerald-300"
                      rows={3}
                    />
                    {translatingCustomerNote && (
                      <p className="text-xs text-gray-400 mt-1 animate-pulse">⏳ Translating...</p>
                    )}
                    {customerNoteTranslations && !translatingCustomerNote && (
                      <div className="mt-2 bg-white border border-emerald-100 rounded-xl px-3 py-2 space-y-1">
                        <p className="text-xs text-gray-500"><span className="font-medium text-gray-700">EN:</span> {customerNoteTranslations.english}</p>
                        <p className="text-xs text-gray-500"><span className="font-medium text-gray-700">繁:</span> {customerNoteTranslations.traditional}</p>
                        <p className="text-xs text-gray-500"><span className="font-medium text-gray-700">简:</span> {customerNoteTranslations.simplified}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setQualityCheckAppt(null)} className="flex-1 px-4 py-2 text-gray-600 font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
                  <button onClick={submitQualityCheck} disabled={submittingQualityCheck} className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors">
                    {submittingQualityCheck ? '⏳ Completing...' : '✓ Ready for Pickup'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}

// ── Appointment card ─────────────────────────────────────────────────────────
function ApptCard({
  appt,
  onAction,
  onAccept,
  onDecline,
  onTap,
  onReschedule,
  loadingId,
  showStart,
  showComplete,
  showConfirm,
  showAccept,
  showDateBadge,
  showNoShow,
  showReschedule,
  serviceLabels,
}: {
  appt: Appointment
  onAction: (id: string, action: string) => void
  onAccept?: (appt: Appointment) => void
  onDecline?: (appt: Appointment) => void
  onTap?: (appt: Appointment) => void
  onReschedule?: (appt: Appointment) => void
  loadingId: string | null
  showStart?: boolean
  showComplete?: boolean
  showConfirm?: boolean
  showAccept?: boolean
  showDateBadge?: boolean
  showNoShow?: boolean
  showReschedule?: boolean
  serviceLabels?: Record<string, string>
}) {
  const isLoading = loadingId === appt.id
  const hasActions = showStart || showComplete || showConfirm || showAccept || showNoShow || showReschedule

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
      appt.grooming_status === 'incare' ? 'border-sky-200' : appt.status === 'pending' && appt.confirmed_at ? 'border-orange-300' : 'border-gray-100'
    }`}>
      <div className="flex">
        {/* Time column — left, standalone (only for Today tab; hidden when showing date badge) */}
        {!showDateBadge && (
          <div className="w-16 shrink-0 flex flex-col items-center justify-start pt-3 pb-3 px-1 bg-gray-50 border-r border-gray-100 gap-1">
            {/* Scheduled time */}
            <span className={`text-xs font-bold tabular-nums text-center leading-tight ${appt.grooming_status === 'incare' ? 'text-sky-600' : 'text-gray-500'}`}>
              {formatTime(appt.appointment_time).replace(' ', '\n')}
            </span>
            {/* Check-in time */}
            {appt.checked_in_at && (
              <span className="text-[10px] text-emerald-600 font-semibold text-center leading-tight" title="Checked in">
                in {new Date(appt.checked_in_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' }).replace(' ', '\n')}
              </span>
            )}
            {/* Total grooming duration (start → finish) */}
            {appt.grooming_started_at && appt.grooming_finished_at && (() => {
              const t = Math.round((new Date(appt.grooming_finished_at).getTime() - new Date(appt.grooming_started_at).getTime()) / 60000)
              const h = Math.floor(t / 60), m = t % 60
              const label = h > 0 ? `${h}hr${m > 0 ? ` ${m}min` : ''}` : `${m}min`
              return (
                <span className="text-[10px] text-violet-600 font-bold text-center leading-tight" title="Grooming time">
                  ⏱{label}
                </span>
              )
            })()}
            {/* In progress — show elapsed since start */}
            {appt.grooming_started_at && !appt.grooming_finished_at && (() => {
              const t = Math.round((Date.now() - new Date(appt.grooming_started_at).getTime()) / 60000)
              const h = Math.floor(t / 60), m = t % 60
              const label = h > 0 ? `${h}hr${m > 0 ? ` ${m}min` : ''}` : `${m}min`
              return (
                <span className="text-[10px] text-sky-600 font-bold text-center leading-tight animate-pulse" title="Time since grooming started">
                  ⏱{label}
                </span>
              )
            })()}
          </div>
        )}

        <div className={`flex-1 flex items-start gap-3 p-3 ${onTap ? 'cursor-pointer active:bg-gray-50' : ''}`}
          onClick={() => onTap?.(appt)}>
          {/* Pet photo */}
          {appt.pets?.photo_url ? (
            <img src={appt.pets.photo_url} alt={appt.pets.name} className="w-10 h-10 rounded-xl object-cover flex-shrink-0 mt-0.5" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center flex-shrink-0 text-lg mt-0.5">🐾</div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              {/* Pet name bold */}
              <p className="font-bold text-gray-900 text-sm leading-tight">{appt.pets?.name ?? 'Unknown Pet'}{appt.payment_amount ? <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white text-[10px] font-bold leading-none">$</span> : null}</p>
              {/* Date badge (Upcoming tab only) or tap-to-view indicator */}
              {showDateBadge ? (
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  <span className="text-xs bg-sky-50 text-sky-600 px-2 py-0.5 rounded-full font-medium">
                    {formatDate(appt.appointment_date)}
                  </span>
                  {appt.status === 'pending' && appt.confirmed_at && (
                    <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">
                      🔄 Rescheduled
                    </span>
                  )}
                </div>
              ) : appt.status === 'pending' && appt.confirmed_at ? (
                <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">
                  🔄 Rescheduled
                </span>
              ) : onTap ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              ) : null}
            </div>
            {/* Owner name */}
            <p className="text-xs text-gray-400 mt-0.5">{appt.clients?.name}</p>

            {/* Service chip */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {(serviceLabels ?? SERVICE_LABELS)[appt.service] || appt.service}
              </span>
              {appt.pets?.breed && <span className="text-xs text-gray-400">{appt.pets.breed}</span>}
              {showComplete && (
                <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-semibold">
                  ✂️ In Progress
                </span>
              )}
            </div>

            {/* Time under date badge (Upcoming tab) */}
            {showDateBadge && (
              <p className="text-xs text-gray-400 mt-1">{formatTime(appt.appointment_time)}</p>
            )}

            {/* Requested at — shown on pending acceptance cards */}
            {showAccept && appt.created_at && (
              <p className="text-xs text-gray-400 mt-1">📨 Requested {formatRequestedAt(appt.created_at)}</p>
            )}

            {/* Notes chips (exclude add-on entries) */}
            {appt.notes_list && appt.notes_list.filter((n: {is_addon?: boolean}) => !n.is_addon).length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {appt.notes_list.filter((n: {is_addon?: boolean}) => !n.is_addon).slice(0, 3).map((note: {text?: string}, i: number) => (
                  <span key={i} className="text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full border border-violet-100">
                    {(note.text ?? '').slice(0, 40)}{(note.text ?? '').length > 40 ? '…' : ''}
                  </span>
                ))}
              </div>
            )}

          {/* Completed: show payment */}
          {appt.status === 'completed' && (
            <div className="mt-1.5">
              {appt.payment_status === 'paid' ? (
                <span className="text-xs text-emerald-600 font-semibold">
                  ✓ Paid{appt.payment_amount ? ` $${appt.payment_amount}` : ''}
                  {appt.tip_amount && parseFloat(appt.tip_amount) > 0 ? ` + $${appt.tip_amount} tip` : ''}
                </span>
              ) : appt.payment_status === 'cash_pending' ? (
                <span className="text-xs text-sky-500 font-medium">💵 Cash — pending collection</span>
              ) : null}
            </div>
          )}

          {/* Action buttons — single row */}
          {hasActions && (
            <div className="mt-3 flex gap-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
              {showAccept && onAccept && (
                <button onClick={() => onAccept(appt)} disabled={isLoading}
                  className="flex-1 py-2 text-sm font-semibold rounded-xl bg-emerald-500 text-white disabled:opacity-50 active:bg-emerald-600 transition-colors shadow-sm">
                  {isLoading ? '…' : '✓ Accept'}
                </button>
              )}
              {showAccept && onDecline && (
                <button onClick={() => onDecline(appt)} disabled={isLoading}
                  className="px-4 py-2 text-sm font-semibold rounded-xl bg-red-50 text-red-500 border border-red-200 disabled:opacity-50 active:bg-red-100 transition-colors">
                  {isLoading ? '…' : 'Decline'}
                </button>
              )}
              {showConfirm && (
                <button onClick={() => onAction(appt.id, 'confirm')} disabled={isLoading}
                  className="flex-1 py-2 text-xs font-semibold rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 disabled:opacity-50 active:bg-emerald-100 transition-colors">
                  {isLoading ? '…' : '✓ Confirm'}
                </button>
              )}
              {showStart && (
                <button onClick={() => onAction(appt.id, 'start')} disabled={isLoading}
                  className="flex-1 py-2 text-xs font-semibold rounded-xl bg-sky-50 text-sky-700 border border-sky-200 disabled:opacity-50 active:bg-sky-100 transition-colors">
                  {isLoading ? '…' : '▶ Start'}
                </button>
              )}
              {showComplete && (
                <button onClick={() => onAction(appt.id, 'complete')} disabled={isLoading}
                  className="flex-1 py-2 text-xs font-semibold rounded-xl bg-emerald-500 text-white disabled:opacity-50 active:bg-emerald-600 transition-colors">
                  {isLoading ? '…' : '✓ Done'}
                </button>
              )}
              {showReschedule && onReschedule && (
                <button onClick={() => onReschedule(appt)} disabled={isLoading}
                  className="flex-1 py-2 text-xs font-semibold rounded-xl bg-amber-50 text-amber-700 border border-amber-200 disabled:opacity-50 active:bg-amber-100 transition-colors">
                  🔄 Reschedule
                </button>
              )}
              {showNoShow && (
                <button onClick={() => onAction(appt.id, 'cancel-today')} disabled={isLoading}
                  className="flex-1 py-2 text-xs font-semibold rounded-xl bg-gray-100 text-gray-600 border border-gray-200 disabled:opacity-50 active:bg-gray-200 transition-colors">
                  {isLoading ? '…' : '✕ Cancel'}
                </button>
              )}
              {showNoShow && (
                <button onClick={() => onAction(appt.id, 'no-show')} disabled={isLoading}
                  className="flex-1 py-2 text-xs font-semibold rounded-xl bg-rose-50 text-rose-600 border border-rose-200 disabled:opacity-50 active:bg-rose-100 transition-colors">
                  {isLoading ? '…' : '👻 No Show'}
                </button>
              )}
            </div>
          )}
          </div>{/* end content */}
        </div>{/* end flex-1 + photo */}
      </div>{/* end outer flex */}
    </div>
  )
}
