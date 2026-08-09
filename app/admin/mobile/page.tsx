'use client'

import ChatIconButton from '@/components/ChatIconButton'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { TagPill, TagPicker, tagClasses, type Tag as PetTag } from '@/lib/tags'
import { readAuthRaw, clearAuth } from '@/lib/authStorage'

// Dashboard-tab permissions are managed once, on the desktop admin's tab set
// (see DASHBOARD_TABS in app/admin/settings/page.tsx). Mobile has a smaller,
// differently-named set of tabs, so each one maps to whichever desktop tab it
// most closely corresponds to for the purpose of checking `allowed_tabs`.
const MOBILE_TAB_PERMISSION_KEY: Record<string, string> = {
  pending: 'requests',
  today: 'today',
  upcoming: 'requests',
  all: 'requests',
  calendar: 'calendar',
  customers: 'clients',
  checkout: 'cashier',
  settings: 'settings',
}

type StaffMember = {
  id: string
  name: string
  first_name?: string | null
  last_name?: string | null
  role: string
  is_active: boolean
  commission_percent: number
  tip_percent: number
  created_at: string
}

type Pet = {
  id: string
  name: string
  breed: string | null
  weight: string | null
  vaccine_status: string
  photo_url: string | null
  notes_chinese: string | null
  notes_english: string | null
}

type ClientRecord = {
  id: string
  name: string
  phone: string
  email: string | null
  created_at: string
  sms_consent?: boolean | null
  sms_consent_at?: string | null
  pets: Pet[]
  appointments: { id: string; appointment_date: string; appointment_time: string; service: string; status: string; assigned_groomer?: string | null; assigned_bather?: string | null }[]
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

const TIMEZONES = [
  { label: 'Pacific Time (LA)',    value: 'America/Los_Angeles' },
  { label: 'Mountain Time (Denver)', value: 'America/Denver' },
  { label: 'Central Time (Chicago)', value: 'America/Chicago' },
  { label: 'Eastern Time (New York)', value: 'America/New_York' },
  { label: 'Hawaii',               value: 'Pacific/Honolulu' },
  { label: 'Alaska',               value: 'America/Anchorage' },
]

const SALON_TZ = 'America/Los_Angeles'

// How many ms the given timezone is ahead of UTC at `date`.
function tzOffsetMs(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const m: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) m[p.type] = p.value
  const hh = m.hour === '24' ? '00' : m.hour
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +hh, +m.minute, +m.second)
  return asUTC - date.getTime()
}

// Parse an appointment's date + wall-clock time as a moment in the salon's
// timezone (Pacific), so "Late" is correct regardless of the device's timezone.
function parseApptTimeLA(dateStr: string, timeStr: string): Date {
  const upper = (timeStr || '').trim().toUpperCase()
  let h: number, m: number
  if (upper.includes('AM') || upper.includes('PM')) {
    const [t, period] = upper.split(' ')
    const [hStr, mStr] = t.split(':')
    h = parseInt(hStr, 10)
    m = parseInt(mStr || '0', 10)
    if (period === 'PM' && h !== 12) h += 12
    if (period === 'AM' && h === 12) h = 0
  } else {
    const [hStr, mStr] = upper.split(':')
    h = parseInt(hStr, 10)
    m = parseInt(mStr || '0', 10)
  }
  if (isNaN(h) || isNaN(m)) return new Date(0)
  const [Y, Mo, D] = dateStr.split('-').map(Number)
  const asUTC = Date.UTC(Y, Mo - 1, D, h, m, 0)
  let off = tzOffsetMs(SALON_TZ, new Date(asUTC))
  off = tzOffsetMs(SALON_TZ, new Date(asUTC - off))
  return new Date(asUTC - off)
}

type EditDraft = {
  petName: string; petBreed: string; petWeight: string
  payAmount: string; tipAmount: string; payMethod: string; payStatus: string
  notes: string
  service: string; apptStatus: string
}

type NoteEntry = {
  id: string
  text: string
  notes_english?: string | null
  notes_chinese?: string | null
  author?: string
  created_at?: string
  is_addon?: boolean
  price?: string
}

type Appointment = {
  id: string
  client_phone: string
  service: string
  appointment_date: string
  appointment_time: string
  notes: string | null
  notes_chinese: string | null
  notes_english: string | null
  notes_list?: NoteEntry[] | null
  status: string
  created_at: string
  confirmed_at: string | null
  assigned_groomer?: string | null
  assigned_bather?: string | null
  groomer_confirmed?: boolean | null
  payment_amount?: string | null
  size_tier?: string | null
  payment_method?: string | null
  payment_status?: string | null
  tip_amount?: string | null
  grooming_status?: string | null
  grooming_status_updated_at?: string | null
  checked_in_at?: string | null
  grooming_started_at?: string | null
  grooming_finished_at?: string | null
  owner_notified_at?: string | null
  checked_out_at?: string | null
  health_check?: any | null
  grooming_quality?: any | null
  clients: { name: string; phone: string; email: string | null } | null
  pets: { id?: string; name: string; breed: string | null; weight: string | null; vaccine_status: string; photo_url: string | null } | null
}

const SERVICE_LABELS: Record<string, string> = {
  simply_cute: 'Simply Cute',
  bath_brush: 'Bath & Brush',
  asian_fusion: 'Asian Fusion Style',
}

const SERVICE_SHORT: Record<string, string> = {
  simply_cute: 'SC',
  bath_brush: 'B/B',
  asian_fusion: 'AF',
}

const VACCINE_COLORS: Record<string, string> = {
  verified: 'bg-green-100 text-green-700',
  email_sent: 'bg-yellow-100 text-yellow-700',
  pending: 'bg-red-100 text-red-700',
  expired: 'bg-red-100 text-red-700',
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function formatTime(timeStr: string) {
  // Times are stored as "9:30 AM" already — return as-is
  return timeStr
}

const BREED_SUGGESTIONS = [
  'Labrador Retriever','Golden Retriever','French Bulldog','German Shepherd','Poodle',
  'Bulldog','Beagle','Rottweiler','Dachshund','Siberian Husky','Shih Tzu','Chihuahua',
  'Yorkshire Terrier','Maltese','Pomeranian','Bichon Frise','Cavalier King Charles Spaniel',
  'Shih Poo','Goldendoodle','Labradoodle','Bernedoodle','Cockapoo','Mini Schnauzer',
]

const WEIGHT_OPTIONS = [
  'Small (under 15 lbs)',
  'Medium (16–30 lbs)',
  'Large (31–50 lbs)',
  'X-Large (46–70 lbs)',
  'XX-Large (71+ lbs)',
]

function BreedInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const filtered = BREED_SUGGESTIONS.filter(b => b.toLowerCase().includes(value.toLowerCase()) && b.toLowerCase() !== value.toLowerCase())
  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  return (
    <div ref={ref} className="relative">
      <input type="text" value={value} onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)} placeholder="Breed (optional)"
        className={className} />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
          {filtered.map(b => (
            <button key={b} type="button" onMouseDown={() => { onChange(b); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-sky-50 text-gray-700">
              {b}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  // null = full access (either unrestricted, or not loaded yet).
  const [allowedTabs, setAllowedTabs] = useState<string[] | null>(null)

  const [tab, setTab] = useState<'pending' | 'today' | 'upcoming' | 'all' | 'calendar' | 'customers' | 'checkout' | 'settings'>('pending')
  const [pendingCount, setPendingCount] = useState(0)
  // Checkout state
  const [checkoutAppts, setCheckoutAppts] = useState<Appointment[]>([])
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [expandedCheckoutId, setExpandedCheckoutId] = useState<string | null>(null)
  const [checkoutPayAmount, setCheckoutPayAmount] = useState<Record<string, string>>({})
  const [checkoutTipAmount, setCheckoutTipAmount] = useState<Record<string, string>>({})
  const [checkoutPayMethod, setCheckoutPayMethod] = useState<Record<string, string>>({})
  const [checkoutPayStatus, setCheckoutPayStatus] = useState<Record<string, string>>({})
  const [savingCheckoutId, setSavingCheckoutId] = useState<string | null>(null)
  const [todaySearch, setTodaySearch] = useState('')
  // Period reports on the Check Out tab (Today uses today's list; wider ranges
  // load all appointments and filter client-side, like the desktop Reports tab).
  const [reportRange, setReportRange] = useState<'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'all' | 'custom'>('today')
  const [reportCustomDate, setReportCustomDate] = useState('') // YYYY-MM-DD for "pick a day"
  const [reportAppts, setReportAppts] = useState<Appointment[]>([])
  const [reportLoading, setReportLoading] = useState(false)
  const [groomerFilter, setGroomerFilter] = useState<string | null>(null)
  const [expandedApptId, setExpandedApptId] = useState<string | null>(null)
  const [expandedPetTags, setExpandedPetTags] = useState<PetTag[]>([])
  // Settings: tags
  const [tagsList, setTagsList] = useState<PetTag[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('sky')
  const [savingTag, setSavingTag] = useState(false)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Settings state
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [newStaffName, setNewStaffName] = useState('')
  const [newStaffRole, setNewStaffRole] = useState('groomer')
  const [timezone, setTimezone] = useState('America/Los_Angeles')
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  // Availability state
  const [openDays, setOpenDays] = useState<number[]>([1, 2, 3, 4, 5, 6])
  const [openTime, setOpenTime] = useState('9:00 AM')
  const [closeTime, setCloseTime] = useState('4:00 PM')
  const [appointmentInterval, setAppointmentInterval] = useState<15 | 30>(30)
  const [blockedHours, setBlockedHours] = useState<{ start: string; end: string }[]>([])
  const [newHourStart, setNewHourStart] = useState('12:00 PM')
  const [newHourEnd, setNewHourEnd] = useState('1:00 PM')
  const [availSaved, setAvailSaved] = useState(false)

  // Blocked dates state
  const [blockedDatesList, setBlockedDatesList] = useState<{ id: string; date: string; reason: string | null }[]>([])
  const [newBlockDate, setNewBlockDate] = useState('')
  const [newBlockReason, setNewBlockReason] = useState('')

  // Service pricing tiers — must be declared before services state
  type PriceTier = { label: string; price: string; duration: string }
  type ServicePricingMap = Record<string, PriceTier[]>
  const DEFAULT_TIERS: PriceTier[] = [
    { label: 'Small (under 15 lbs)', price: '', duration: '' },
    { label: 'Medium (15–30 lbs)',   price: '', duration: '' },
    { label: 'Large (30–50 lbs)',    price: '', duration: '' },
    { label: 'XLarge (50+ lbs)',     price: '', duration: '' },
  ]
  const [servicePricing, setServicePricing] = useState<ServicePricingMap>({
    simply_cute:  DEFAULT_TIERS.map(t => ({...t})),
    bath_brush:   DEFAULT_TIERS.map(t => ({...t})),
    asian_fusion: DEFAULT_TIERS.map(t => ({...t})),
  })
  const [pricingSaved, setPricingSaved] = useState(false)
  const [hoursSaved, setHoursSaved] = useState(false)

  // Services state — uses DEFAULT_TIERS, must come after it
  const [services, setServices] = useState([
    { id: 'simply_cute', name: 'Simply Cute', desc: 'Classic clean cut, bath, blow-dry & finishing touches', price: '', tiers: DEFAULT_TIERS.map(t => ({...t})) },
    { id: 'bath_brush', name: 'Bath & Brush', desc: 'Thorough bath, blow-dry & brush-out', price: '', tiers: DEFAULT_TIERS.map(t => ({...t})) },
    { id: 'asian_fusion', name: 'Asian Fusion Style', desc: 'Creative styling with a modern Asian-inspired look', price: '', tiers: DEFAULT_TIERS.map(t => ({...t})) },
  ])
  // Dynamic lookup: static labels + anything added via Settings
  const serviceMap: Record<string, string> = {
    ...SERVICE_LABELS,
    ...Object.fromEntries(services.filter(s => s.name).map(s => [s.id, s.name])),
  }
  const serviceShortMap: Record<string, string> = {
    ...SERVICE_SHORT,
    ...Object.fromEntries(services.filter(s => s.name).map(s => [s.id, s.name.slice(0, 3).toUpperCase()])),
  }
  const [servicesSaved, setServicesSaved] = useState(false)

  // Delete confirmation
  const [deletingApptId, setDeletingApptId] = useState<string | null>(null)
  const [deletingPetId, setDeletingPetId] = useState<string | null>(null)

  // Vaccine status inline edit
  const [editingVaccineId, setEditingVaccineId] = useState<string | null>(null)
  const [savingVaccineId, setSavingVaccineId] = useState<string | null>(null)
  const [quickVaxPetId, setQuickVaxPetId] = useState<string | null>(null)

  // Edit appointment modal
  const [editApptId, setEditApptId] = useState<string | null>(null)
  const [editApptDraft, setEditApptDraft] = useState<{ service: string; date: string; time: string; notes: string }>({ service: '', date: '', time: '', notes: '' })
  const [savingEditAppt, setSavingEditAppt] = useState(false)

  // Reschedule (per card)
  const [reschedulingId, setReschedulingId] = useState<string | null>(null)
  const [rescheduleData, setRescheduleData] = useState<Record<string, { date: string; time: string }>>({})
  const [savingRescheduleId, setSavingRescheduleId] = useState<string | null>(null)

  // Service / Add-ons / Price editing
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [editServiceVal, setEditServiceVal] = useState('')
  const [savingServiceId, setSavingServiceId] = useState<string | null>(null)
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [priceEditVal, setPriceEditVal] = useState('')
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null)
  const [popupBasePrice, setPopupBasePrice] = useState('')
  const [popupBaseTier, setPopupBaseTier] = useState('')  // tier label to avoid same-price collision
  const [popupAddOns, setPopupAddOns] = useState<{id:string;name:string;price:string}[]>([])
  const [popupAddonDraft, setPopupAddonDraft] = useState({ text: '', price: '' })
  const [popupTotalSaved, setPopupTotalSaved] = useState(false)
  const [popupCouponId, setPopupCouponId] = useState<string | null>(null)
  const [savingPopupPayment, setSavingPopupPayment] = useState(false)
  const [editDraftBasePrice, setEditDraftBasePrice] = useState('')
  const [editDraftBaseTier, setEditDraftBaseTier] = useState('')  // tier label to avoid same-price collision
  const [editDraftAddOns, setEditDraftAddOns] = useState<{id:string;name:string;price:string}[]>([])
  const [editDraftAddonDraft, setEditDraftAddonDraft] = useState({ text: '', price: '' })
  const [editDraftTotalSaved, setEditDraftTotalSaved] = useState(false)
  const [editDraftCouponId, setEditDraftCouponId] = useState<string | null>(null)
  const [savingEditDraftPayment, setSavingEditDraftPayment] = useState(false)
  // Calendar detail sheet — Service & Price / Add-ons
  const [calendarBasePrice, setCalendarBasePrice] = useState('')
  const [calendarBaseTier, setCalendarBaseTier] = useState('')
  const [calendarAddOns, setCalendarAddOns] = useState<{id:string;name:string;price:string}[]>([])
  const [calendarAddonDraft, setCalendarAddonDraft] = useState({ text: '', price: '' })
  const [calendarTotalSaved, setCalendarTotalSaved] = useState(false)
  const [savingCalendarPayment, setSavingCalendarPayment] = useState(false)
  // Discount codes (shared with desk/groomer)
  type MobileCoupon = { id: string; name: string; code: string | null; discount_type: 'percent' | 'fixed'; discount_value: number; active: boolean; first_visit_only?: boolean }
  const [availableCoupons, setAvailableCoupons] = useState<MobileCoupon[]>([])
  const [mobileIsFirstTime, setMobileIsFirstTime] = useState(false)
  // EditPanel notes states
  const [epAddingNote, setEpAddingNote] = useState(false)
  const [epNoteText, setEpNoteText] = useState('')
  const [epSavingNote, setEpSavingNote] = useState(false)
  const [epEditNoteId, setEpEditNoteId] = useState<string | null>(null)
  const [epEditNoteText, setEpEditNoteText] = useState('')
  const [epSavingEditNote, setEpSavingEditNote] = useState(false)
  const [epNoteTranslations, setEpNoteTranslations] = useState<{english:string;traditional:string;simplified:string;detected:string}|null>(null)
  const [epTranslating, setEpTranslating] = useState(false)
  const epNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const epIsComposingRef = useRef(false)
  const epNoteInputRef = useRef<HTMLTextAreaElement>(null)

  // Customers state
  const [customers, setCustomers] = useState<ClientRecord[]>([])
  const [customersLoading, setCustomersLoading] = useState(false)
  const [expandedClient, setExpandedClient] = useState<string | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [uploadingPetId, setUploadingPetId] = useState<string | null>(null)
  const [editingClientPhone, setEditingClientPhone] = useState<string | null>(null)
  const [editingClientNameVal, setEditingClientNameVal] = useState('')
  const [savingClientName, setSavingClientName] = useState(false)
  const petPhotoRef = useRef<HTMLInputElement>(null)

  // Notes state — free-text with 3-way auto-translation
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, {chinese: string, english: string}>>({})
  const [translatingId, setTranslatingId] = useState<string | null>(null)
  const [noteTranslationsMap, setNoteTranslationsMap] = useState<Record<string, {english:string;traditional:string;simplified:string;detected:string}>>({})
  const noteTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // (startedAtMap removed — we now use grooming_started_at from DB instead)

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [calendarAppts, setCalendarAppts] = useState<Appointment[]>([])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [calendarDetailAppt, setCalendarDetailAppt] = useState<Appointment | null>(null)
  const [detailSheetTab, setDetailSheetTab] = useState<'appt'|'customer'|'history'|'future'|'notes'>('appt')
  // Full appointment history for the client currently open in the detail sheet.
  // The "History" tab used to derive past visits only from whatever was already
  // loaded locally (today's appointments + the currently viewed calendar month),
  // so a visit from a different month (e.g. a prior month) silently disappeared
  // from "previous visits" even though it exists in the DB. Fetching the client's
  // full record (same endpoint the desktop Pet Parents tab uses) fixes that.
  const [fullClientAppts, setFullClientAppts] = useState<Appointment[] | null>(null)
  useEffect(() => {
    const phone = calendarDetailAppt?.client_phone
    if (!phone) { setFullClientAppts(null); return }
    setFullClientAppts(null)
    fetch(`/api/admin/clients?phone=${encodeURIComponent(phone)}`)
      .then(r => r.json())
      .then(d => setFullClientAppts(d.clients?.[0]?.appointments ?? []))
      .catch(() => setFullClientAppts([]))
  }, [calendarDetailAppt?.client_phone])
  const [calendarStaffFilter, setCalendarStaffFilter] = useState<string>('all')
  const [blockedTimes, setBlockedTimes] = useState<{date:string;time:string;reason:string|null}[]>([])

  // Add appointment modal state
  const [addingApptSlot, setAddingApptSlot] = useState<{date:string;time:string}|null>(null)
  const [addApptPhone, setAddApptPhone] = useState('')
  const [addApptFirstName, setAddApptFirstName] = useState('')
  const [addApptLastName, setAddApptLastName] = useState('')
  const [addApptEmail, setAddApptEmail] = useState('')
  const [addApptPetId, setAddApptPetId] = useState('')
  const [addApptPetName, setAddApptPetName] = useState('')
  const [addApptBreed, setAddApptBreed] = useState('')
  const [addApptWeight, setAddApptWeight] = useState('')
  const [addApptVaccine, setAddApptVaccine] = useState('pending')
  const [addApptService, setAddApptService] = useState('bath_brush')
  const [addApptSaving, setAddApptSaving] = useState(false)
  const [addApptClientData, setAddApptClientData] = useState<{name:string;pets:{id:string;name:string;breed?:string;weight?:string}[]}|null>(null)
  const [addApptPhoneLooking, setAddApptPhoneLooking] = useState(false)
  const [blockingSlot, setBlockingSlot] = useState<{date:string;time:string}|null>(null)
  const [blockReason, setBlockReason] = useState('')
  const [savingBlock, setSavingBlock] = useState(false)

  useEffect(() => {
    try {
      const auth = JSON.parse(readAuthRaw('admin') || 'null')
      if (auth?.role === 'admin') {
        setAuthed(true)
        // Re-check permissions against the live staff record (not the
        // possibly-stale login-time snapshot).
        fetch('/api/admin/staff').then(r => r.json()).then(d => {
          const me = (d.staff || []).find((s: { username?: string }) => s.username?.toLowerCase() === auth.username?.toLowerCase())
          const allowed = me?.permissions?.allowed_tabs
          setAllowedTabs(Array.isArray(allowed) ? allowed : null)
        }).catch(() => setAllowedTabs(null))
      } else {
        router.push('/login')
      }
    } catch {
      router.push('/login')
    }
    setCheckingAuth(false)
    fetch('/api/admin/coupons').then(r => r.json()).then(d => {
      setAvailableCoupons((d.coupons ?? []).filter((c: MobileCoupon) => c.active))
    }).catch(() => {})
  }, [router])

  // If this admin is restricted and the current tab maps to a desktop tab
  // they're not allowed to see, jump to their first allowed tab (if any).
  useEffect(() => {
    if (!allowedTabs) return
    const currentAllowed = allowedTabs.includes(MOBILE_TAB_PERMISSION_KEY[tab] ?? tab)
    if (!currentAllowed) {
      const firstOk = Object.keys(MOBILE_TAB_PERMISSION_KEY).find(k => allowedTabs.includes(MOBILE_TAB_PERMISSION_KEY[k]))
      if (firstOk) setTab(firstOk as typeof tab)
    }
  }, [allowedTabs, tab])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const saveNotes = async (id: string) => {
    const draft = noteDrafts[id]
    if (!draft) return

    try {
      // Check if this is a pet note (format: "pet_{petId}") or appointment note
      const isPetNote = id.startsWith('pet_')
      const endpoint = isPetNote
        ? `/api/admin/pets/${id.slice(4)}`
        : `/api/admin/appointments/${id}`

      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isPetNote
            ? {
                action: 'update-notes',
                notes_chinese: draft.chinese,
                notes_english: draft.english,
              }
            : {
                action: 'update-notes',
                notes_chinese: draft.chinese,
                notes_english: draft.english,
              }
        ),
      })
      const data = await res.json()
      if (data.success) {
        showToast('Notes saved!')
        // Refresh the appropriate data
        if (isPetNote) {
          fetchCustomers()
        } else {
          fetchAppointments()
        }
      }
    } catch {
      showToast('Failed to save notes')
    }
  }

  // Auto-translate notes after user stops typing (800ms debounce)
  const triggerAutoTranslateMobile = useCallback((id: string, text: string) => {
    if (noteTimersRef.current[id]) clearTimeout(noteTimersRef.current[id])
    if (!text.trim()) {
      setNoteTranslationsMap(prev => { const n = {...prev}; delete n[id]; return n })
      return
    }
    noteTimersRef.current[id] = setTimeout(async () => {
      setTranslatingId(id)
      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        const data = await res.json()
        if (data.english !== undefined || data.traditional !== undefined) {
          setNoteTranslationsMap(prev => ({
            ...prev,
            [id]: {
              english: data.english || '',
              traditional: data.traditional || '',
              simplified: data.simplified || '',
              detected: data.detected || 'unknown',
            },
          }))
        }
      } catch { /* silent — mobile, no toast needed */ }
      finally { setTranslatingId(null) }
    }, 800)
  }, [])

  const fetchAppointments = useCallback(async () => {
    setLoading(true)
    try {
      // pending tab uses 'requests' to get all sections (pending + confirmed needs-staff)
      const apiStatus = tab === 'pending' ? 'requests' : tab
      const res = await fetch(`/api/admin/appointments?status=${apiStatus}`, { cache: 'no-store' })
      const data = await res.json()
      setAppointments(data.appointments || [])
      if (tab === 'pending') {
        const allAppts = data.appointments || []
        const alertCount = allAppts.filter((a: Appointment) =>
          a.status === 'pending' ||
          (a.status === 'confirmed' && !a.assigned_groomer && !a.assigned_bather) ||
          (a.status === 'confirmed' && (a.assigned_groomer || a.assigned_bather) && !a.groomer_confirmed)
        ).length
        setPendingCount(alertCount)
      }
    } catch {
      setAppointments([])
    }
    setLoading(false)
  }, [tab])

  const fetchCalendar = useCallback(async () => {
    setLoading(true)
    try {
      const [apptRes, btRes, sRes] = await Promise.all([
        fetch(`/api/admin/appointments?status=month&month=${calendarMonth}`),
        fetch('/api/admin/blocked-times'),
        fetch('/api/admin/settings'),
      ])
      const apptData = await apptRes.json()
      const btData = await btRes.json()
      const sData = await sRes.json()
      setCalendarAppts(apptData.appointments || [])
      setBlockedTimes(btData.blocked_times || [])
      const s = sData.settings || {}
      if (s.open_time) setOpenTime(s.open_time)
      if (s.close_time) setCloseTime(s.close_time)
    } catch {
      setCalendarAppts([])
    }
    setLoading(false)
  }, [calendarMonth])

  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true)
    const [staffRes, settingsRes, blockedRes, tagsRes] = await Promise.all([
      fetch('/api/admin/staff'),
      fetch('/api/admin/settings'),
      fetch('/api/admin/blocked-dates'),
      fetch('/api/admin/tags'),
    ])
    const staffData = await staffRes.json()
    const settingsData = await settingsRes.json()
    const blockedData = await blockedRes.json()
    try { const td = await tagsRes.json(); setTagsList(td.tags || []) } catch {}
    setStaff(staffData.staff || [])
    const s = settingsData.settings || {}
    if (s.timezone) setTimezone(s.timezone)
    if (s.open_days) setOpenDays(JSON.parse(s.open_days))
    if (s.open_time) setOpenTime(s.open_time)
    if (s.close_time) setCloseTime(s.close_time)
    if (s.appointment_interval) setAppointmentInterval(parseInt(s.appointment_interval) as 15 | 30)
    if (s.blocked_hours) { try { setBlockedHours(JSON.parse(s.blocked_hours)) } catch { setBlockedHours([]) } }
    if (s.services) {
      try {
        const loadedSvcs = JSON.parse(s.services)
        let pricingMap: Record<string, { label: string; price: string; duration: string }[]> = {}
        if (s.service_pricing) { try { pricingMap = JSON.parse(s.service_pricing) } catch {/**/} }
        setServices(loadedSvcs.map((svc: { id: string; name: string; desc: string; price: string; tiers?: { label: string; price: string; duration?: string }[] }) => ({
          ...svc,
          tiers: (svc.tiers ?? pricingMap[svc.id] ?? DEFAULT_TIERS.map((t: PriceTier) => ({...t}))).map((t: { label: string; price: string; duration?: string }) => ({ label: t.label, price: t.price, duration: t.duration ?? '' })),
        })))
      } catch {/**/}
    }
    if (s.service_pricing) {
      try {
        const loaded = JSON.parse(s.service_pricing)
        setServicePricing(prev => ({
          simply_cute:  loaded.simply_cute  ?? prev.simply_cute,
          bath_brush:   loaded.bath_brush   ?? prev.bath_brush,
          asian_fusion: loaded.asian_fusion ?? prev.asian_fusion,
        }))
      } catch {/**/}
    }
    setBlockedDatesList(blockedData.blocked_dates || [])
    setSettingsLoading(false)
  }, [])

  const addStaff = async () => {
    if (!newStaffName.trim()) return
    await fetch('/api/admin/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newStaffName, role: newStaffRole }),
    })
    setNewStaffName('')
    fetchSettings()
  }

  const toggleStaff = async (id: string, is_active: boolean) => {
    await fetch(`/api/admin/staff/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    })
    fetchSettings()
  }

  const saveTimezone = async () => {
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'timezone', value: timezone }),
    })
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }

  const saveServices = async () => {
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'services', value: JSON.stringify(services) }),
    })
    // Also save derived pricing map for compat
    const pricingMap: Record<string, { label: string; price: string; duration: string }[]> = {}
    services.forEach(svc => { if (svc.tiers) pricingMap[svc.id] = svc.tiers })
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'service_pricing', value: JSON.stringify(pricingMap) }),
    })
    setServicesSaved(true)
    setTimeout(() => setServicesSaved(false), 2000)
  }

  const saveAvailability = async () => {
    try {
      const saves = [
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'open_days', value: JSON.stringify(openDays) }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'open_time', value: openTime }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'close_time', value: closeTime }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'appointment_interval', value: String(appointmentInterval) }),
        }),
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'blocked_hours', value: JSON.stringify(blockedHours) }),
        }),
      ]
      const responses = await Promise.all(saves)

      // Check if all responses were successful
      for (let i = 0; i < responses.length; i++) {
        if (!responses[i].ok) {
          const error = await responses[i].json()
          console.error(`Failed to save setting ${i}:`, error)
          alert(`Error saving availability: ${error.error || 'Unknown error'}`)
          return
        }
      }

      console.log('✓ All availability settings saved successfully')
      setAvailSaved(true)
      setTimeout(() => setAvailSaved(false), 2000)
    } catch (error) {
      console.error('Failed to save availability:', error)
      alert(`Error saving availability: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const addBlockedDate = async () => {
    if (!newBlockDate) return
    await fetch('/api/admin/blocked-dates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: newBlockDate, reason: newBlockReason || null }),
    })
    setNewBlockDate('')
    setNewBlockReason('')
    fetchSettings()
  }

  const removeBlockedDate = async (date: string) => {
    await fetch('/api/admin/blocked-dates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    })
    fetchSettings()
  }

  // ── Service / Add-on / Price helpers ─────────────────────────────────────
  const saveService = async (apptId: string, newService: string) => {
    setSavingServiceId(apptId)
    try {
      const res = await fetch(`/api/admin/appointments/${apptId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change-service', service: newService }),
      })
      if (res.ok) {
        setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, service: newService } : a))
        setEditingServiceId(null)
        showToast('✓ Service updated!')
      }
    } catch { showToast('Failed to update service') }
    setSavingServiceId(null)
  }

  const saveQuotePrice = async (apptId: string) => {
    setSavingPriceId(apptId)
    try {
      const res = await fetch(`/api/admin/appointments/${apptId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record-payment', payment_amount: priceEditVal || null }),
      })
      if (res.ok) {
        setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, payment_amount: priceEditVal || null } : a))
        setEditingPriceId(null)
        showToast('✓ Price saved!')
      }
    } catch { /**/ }
    setSavingPriceId(null)
  }

  const deleteAppointment = async (id: string) => {
    setDeletingApptId(id)
    try {
      const res = await fetch(`/api/admin/appointments/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setAppointments(prev => prev.filter(a => a.id !== id))
        showToast('Appointment deleted.')
      } else {
        showToast('⚠️ Delete failed')
      }
    } catch { showToast('⚠️ Delete error') }
    finally { setDeletingApptId(null) }
  }

  const updateVaccineStatus = async (clientPhone: string, petId: string, status: string) => {
    setSavingVaccineId(petId)
    try {
      const res = await fetch(`/api/admin/pets/${petId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaccine_status: status }),
      })
      const data = await res.json()
      if (data.success || !data.error) {
        setCustomers(prev => prev.map(c => c.phone === clientPhone
          ? { ...c, pets: c.pets.map(p => p.id === petId ? { ...p, vaccine_status: status } : p) }
          : c))
        setEditingVaccineId(null)
      }
    } catch { /* ignore */ }
    finally { setSavingVaccineId(null) }
  }

  const quickUpdateVax = async (petId: string, status: string) => {
    setSavingVaccineId(petId)
    try {
      await fetch(`/api/admin/pets/${petId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaccine_status: status }),
      })
      // Update both appointments list and customers list
      setAppointments(prev => prev.map(a => a.pets?.id === petId ? { ...a, pets: { ...a.pets!, vaccine_status: status } } : a))
      setCustomers(prev => prev.map(c => ({ ...c, pets: c.pets.map(p => p.id === petId ? { ...p, vaccine_status: status } : p) })))
      setQuickVaxPetId(null)
      showToast('✓ Vaccine status updated')
    } catch { showToast('Failed to update') }
    finally { setSavingVaccineId(null) }
  }

  const deletePet = async (clientPhone: string, petId: string) => {
    setDeletingPetId(petId)
    try {
      const res = await fetch(`/api/admin/pets/${petId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setCustomers(prev => prev.map(c => c.phone === clientPhone
          ? { ...c, pets: c.pets.filter(p => p.id !== petId) }
          : c))
        showToast('Pet profile deleted.')
      } else {
        showToast('⚠️ Delete failed')
      }
    } catch { showToast('⚠️ Delete error') }
    finally { setDeletingPetId(null) }
  }

  const rescheduleAppointment = async (id: string) => {
    const d = rescheduleData[id]
    if (!d?.date || !d?.time) return
    setSavingRescheduleId(id)
    try {
      const res = await fetch(`/api/admin/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reschedule', appointment_date: d.date, appointment_time: d.time }),
      })
      const data = await res.json()
      if (data.success) {
        setAppointments(prev => prev.map(a => a.id === id ? { ...a, appointment_date: d.date, appointment_time: d.time } : a))
        setReschedulingId(null)
        showToast('✓ Rescheduled!')
      } else {
        showToast('⚠️ Reschedule failed')
      }
    } catch { showToast('⚠️ Reschedule error') }
    finally { setSavingRescheduleId(null) }
  }

  const clearAddApptForm = () => {
    setAddingApptSlot(null)
    setAddApptPhone(''); setAddApptFirstName(''); setAddApptLastName(''); setAddApptEmail('')
    setAddApptPetId(''); setAddApptPetName(''); setAddApptBreed(''); setAddApptWeight('')
    setAddApptVaccine('pending'); setAddApptClientData(null)
  }

  const lookupClientByPhone = useCallback(async (phone: string) => {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 7) return
    setAddApptPhoneLooking(true)
    try {
      const formats = [
        digits,
        digits.length === 10 ? `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}` : null,
        digits.length === 10 ? `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}` : null,
        digits.length === 10 ? `+1${digits}` : null,
      ].filter(Boolean) as string[]

      // Fetch all formats in parallel — much faster than sequential
      const results = await Promise.all(
        formats.map(fmt =>
          fetch(`/api/admin/clients?phone=${encodeURIComponent(fmt)}`).then(r => r.json()).catch(() => ({ clients: [] }))
        )
      )

      let client = null
      for (const data of results) {
        if (data.clients && data.clients.length > 0) {
          const named = data.clients.find((c: {name:string}) => c.name && c.name.replace(/\D/g,'').length !== 10)
          client = named ?? data.clients[0]
          break
        }
      }

      if (client) {
        const displayName = client.name && client.name.replace(/\D/g,'').length === 10 ? '(name not on file)' : client.name
        setAddApptClientData({ name: displayName, pets: client.pets || [] })
        if (client.pets?.length === 1) {
          setAddApptPetId(client.pets[0].id)
          setAddApptPetName(client.pets[0].name)
        }
      } else {
        setAddApptClientData(null)
        setAddApptFirstName(''); setAddApptLastName('')
      }
    } catch {/**/}
    finally { setAddApptPhoneLooking(false) }
  }, [])

  const submitQuickAddAppt = async () => {
    if (!addingApptSlot || !addApptPhone || (!addApptPetId && !addApptPetName)) return
    setAddApptSaving(true)
    try {
      const res = await fetch('/api/admin/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: addApptPhone,
          clientName: `${addApptFirstName.trim()} ${addApptLastName.trim()}`.trim() || addApptPhone,
          email: addApptEmail || null,
          petId: addApptPetId || null,
          petName: addApptPetName,
          breed: addApptBreed || null,
          weight: addApptWeight || null,
          vaccineStatus: addApptVaccine,
          service: addApptService,
          date: addingApptSlot.date,
          time: addingApptSlot.time,
        }),
      })
      const data = await res.json()
      if (data.success) {
        clearAddApptForm()
        showToast('✓ Appointment added!')
        fetchCalendar()
      } else {
        showToast('⚠️ ' + (data.error || 'Error adding appointment'))
      }
    } catch { showToast('⚠️ Error adding appointment') }
    finally { setAddApptSaving(false) }
  }

  const blockTimeSlot = async (date: string, time: string, reason: string) => {
    setSavingBlock(true)
    try {
      const res = await fetch('/api/admin/blocked-times', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time, reason: reason || null }),
      })
      const data = await res.json()
      if (data.success) {
        setBlockedTimes(prev => [...prev.filter(b => !(b.date === date && b.time === time)), { date, time, reason: reason || null }])
        setBlockingSlot(null)
        setBlockReason('')
      }
    } catch { /* ignore */ }
    finally { setSavingBlock(false) }
  }

  const unblockTimeSlot = async (date: string, time: string) => {
    try {
      const res = await fetch('/api/admin/blocked-times', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time }),
      })
      const data = await res.json()
      if (data.success) {
        setBlockedTimes(prev => prev.filter(b => !(b.date === date && b.time === time)))
      }
    } catch { /* ignore */ }
  }

  const fetchCustomers = useCallback(async () => {
    setCustomersLoading(true)
    try {
      const res = await fetch('/api/admin/clients')
      const data = await res.json()
      setCustomers(data.clients || [])
    } catch {
      setCustomers([])
    }
    setCustomersLoading(false)
  }, [])

  const [smsConsentSaving, setSmsConsentSaving] = useState<string | null>(null)
  // Staff-recorded SMS opt-in (e.g. customer agreed verbally at checkout but
  // never checked the box during booking, or the appointment was created by
  // staff via admin quick-add, which never asks for consent at all). Only
  // ever turns consent ON — never used to revoke it from here.
  const grantSmsConsent = async (phone: string) => {
    setSmsConsentSaving(phone)
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, sms_consent: true }),
      })
      if (res.ok) {
        const consentAt = new Date().toISOString()
        setCustomers(prev => prev.map(c => c.phone === phone ? { ...c, sms_consent: true, sms_consent_at: consentAt } : c))
      }
    } catch {/**/}
    finally { setSmsConsentSaving(null) }
  }

  const fetchCheckout = useCallback(async () => {
    setCheckoutLoading(true)
    try {
      const res = await fetch('/api/admin/appointments?status=today')
      const data = await res.json()
      const appts: Appointment[] = data.appointments || []
      setCheckoutAppts(appts)
      // Pre-populate payment fields from existing data
      const amounts: Record<string, string> = {}
      const tips: Record<string, string> = {}
      const methods: Record<string, string> = {}
      const statuses: Record<string, string> = {}
      appts.forEach(a => {
        amounts[a.id] = a.payment_amount || ''
        tips[a.id] = a.tip_amount || ''
        methods[a.id] = a.payment_method || 'cash'
        statuses[a.id] = a.payment_status || 'unpaid'
      })
      setCheckoutPayAmount(amounts)
      setCheckoutTipAmount(tips)
      setCheckoutPayMethod(methods)
      setCheckoutPayStatus(statuses)
    } catch {
      setCheckoutAppts([])
    }
    setCheckoutLoading(false)
  }, [])

  // Load all appointments for the wider-period reports (week/month/etc.)
  const fetchReportAppts = useCallback(async () => {
    setReportLoading(true)
    try {
      const res = await fetch('/api/admin/appointments?status=all')
      const data = await res.json()
      setReportAppts(data.appointments || [])
    } catch {
      setReportAppts([])
    }
    setReportLoading(false)
  }, [])

  const uploadPetPhoto = async (petId: string, file: File) => {
    // Show the new photo INSTANTLY from local file before the server responds
    const localUrl = URL.createObjectURL(file)
    setCustomers(prev => prev.map(c => ({
      ...c,
      pets: c.pets.map(p => p.id === petId ? { ...p, photo_url: localUrl } : p)
    })))

    setUploadingPetId(petId)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('petId', petId)
    try {
      const res = await fetch('/api/admin/pets/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.url) {
        // Replace with the permanent stored URL
        setCustomers(prev => prev.map(c => ({
          ...c,
          pets: c.pets.map(p => p.id === petId ? { ...p, photo_url: data.url } : p)
        })))
        showToast('Photo saved! 📷')
      } else {
        showToast('⚠️ Upload failed: ' + (data.error || 'Unknown error'))
      }
    } catch {
      showToast('⚠️ Upload failed. Check storage settings.')
    }
    setUploadingPetId(null)
  }

  useEffect(() => {
    if (!authed) return
    if (tab === 'calendar') fetchCalendar()
    else if (tab === 'settings') fetchSettings()
    else if (tab === 'customers') fetchCustomers()
    else if (tab === 'checkout') fetchCheckout()
    else fetchAppointments()
    // Always load service settings so pricing tiers are available in all tabs
    if (tab !== 'settings') fetchSettings()
  }, [authed, tab, fetchAppointments, fetchCalendar, fetchSettings, fetchCustomers, fetchCheckout])

  // Load all-appointment data for the Check Out tab's wider-period reports.
  useEffect(() => {
    if (authed && tab === 'checkout' && reportRange !== 'today') fetchReportAppts()
  }, [authed, tab, reportRange, fetchReportAppts])

  // Always load staff on login so groomer/bather dropdowns work on any tab
  useEffect(() => {
    if (!authed) return
    fetch('/api/admin/staff')
      .then(r => r.json())
      .then(d => setStaff(d.staff || []))
      .catch(() => {})
  }, [authed])

  // Auto-refresh Today, Pending, and Check Out tabs every 60 seconds
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  useEffect(() => {
    if (!authed) return
    if (tab === 'today' || tab === 'pending') {
      const iv = setInterval(() => {
        fetchAppointments()
        setLastSyncTime(new Date())
      }, 60000)
      return () => clearInterval(iv)
    }
    if (tab === 'checkout') {
      const iv = setInterval(() => {
        fetchCheckout()
        setLastSyncTime(new Date())
      }, 60000)
      return () => clearInterval(iv)
    }
  }, [authed, tab, fetchAppointments, fetchCheckout])

  // ── Push notification subscription ────────────────────────────────────────
  useEffect(() => {
    if (!authed) return
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return

    const setupPush = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/admin-sw.js')
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
          body: JSON.stringify({ staff_name: 'admin', subscription: sub.toJSON() }),
        })
      } catch (e) {
        console.warn('Admin push setup failed:', e)
      }
    }

    setupPush()
  }, [authed])

  const saveCheckoutPayment = async (apptId: string) => {
    setSavingCheckoutId(apptId)
    try {
      const res = await fetch(`/api/admin/appointments/${apptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record-payment',
          payment_amount: checkoutPayAmount[apptId] || null,
          tip_amount: checkoutTipAmount[apptId] || null,
          payment_method: checkoutPayMethod[apptId] || 'cash',
          payment_status: checkoutPayStatus[apptId] || 'unpaid',
        }),
      })
      const data = await res.json()
      if (data.success) {
        setCheckoutAppts(prev => prev.map(a => a.id === apptId ? {
          ...a,
          payment_amount: checkoutPayAmount[apptId] || null,
          tip_amount: checkoutTipAmount[apptId] || null,
          payment_method: checkoutPayMethod[apptId] || 'cash',
          payment_status: checkoutPayStatus[apptId] || 'unpaid',
        } : a))
        showToast(checkoutPayStatus[apptId] === 'paid' ? '✓ Payment saved!' : 'Payment updated.')
        setExpandedCheckoutId(null)
      } else {
        showToast('⚠️ Failed to save payment')
      }
    } catch { showToast('⚠️ Error saving payment') }
    finally { setSavingCheckoutId(null) }
  }

  const advanceGroomingStatus = async (id: string, nextStatus: 'incare' | 'ready' | 'done') => {
    setActionLoading(id + nextStatus)
    try {
      const res = await fetch(`/api/admin/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grooming-status', grooming_status: nextStatus }),
      })
      const data = await res.json()
      if (data.success) {
        const label = nextStatus === 'incare' ? 'Grooming started! ✂️' : nextStatus === 'ready' ? 'Ready for pickup! 🔔 SMS sent.' : 'Checked out! 🎉'
        showToast(label)
        fetchAppointments()
      } else {
        showToast('Update failed.')
      }
    } catch {
      showToast('Something went wrong.')
    }
    setActionLoading(null)
  }

  const handleAction = async (id: string, action: 'confirm' | 'decline' | 'start' | 'complete') => {
    setActionLoading(id + action)
    try {
      // 'start' = check-in: use kiosk action endpoint so grooming_status + checked_in_at are set correctly
      if (action === 'start') {
        const res = await fetch('/api/kiosk/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'checkin', appointmentId: id }),
        })
        const data = await res.json()
        if (data.success) {
          showToast('Checked in! 🐾')
          fetchAppointments()
        } else {
          showToast('Check-in failed. Try again.')
        }
        setActionLoading(null)
        return
      }

      const res = await fetch(`/api/admin/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (data.success) {
        if (action === 'confirm') showToast('Confirmed! SMS sent to client.')
        else if (action === 'decline') showToast('Request declined.')
        else if (action === 'complete') showToast('Marked as done! ✅')
        fetchAppointments()
      } else {
        showToast('Something went wrong.')
      }
    } catch {
      showToast('Something went wrong.')
    }
    setActionLoading(null)
  }

  const saveEditDraft = async (appt: Appointment) => {
    if (!editDraft) return
    setSavingEdit(true)
    try {
      const petId = appt.pets?.id
      const petUpdates: Record<string, string> = {}
      if (editDraft.petName.trim()) petUpdates.name = editDraft.petName.trim()
      if (editDraft.petBreed.trim()) petUpdates.breed = editDraft.petBreed.trim()
      if (editDraft.petWeight.trim()) petUpdates.weight = editDraft.petWeight.trim()
      if (petId && Object.keys(petUpdates).length > 0) {
        await fetch(`/api/admin/pets/${petId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(petUpdates),
        })
      }
      if (editDraft.service && editDraft.service !== appt.service) {
        await fetch(`/api/admin/appointments/${appt.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update-service', service: editDraft.service }),
        })
      }
      if (editDraft.apptStatus && editDraft.apptStatus !== appt.status) {
        await fetch(`/api/admin/appointments/${appt.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update-status', status: editDraft.apptStatus }),
        })
      }
      showToast('Saved! ✓')
      setExpandedApptId(null)
      setEditDraft(null)
      fetchAppointments()
    } catch {
      showToast('Save failed, try again')
    }
    setSavingEdit(false)
  }

  const triggerEpAutoTranslate = useCallback((text: string) => {
    if (epNoteTimerRef.current) clearTimeout(epNoteTimerRef.current)
    if (!text.trim()) { setEpNoteTranslations(null); return }
    epNoteTimerRef.current = setTimeout(async () => {
      setEpTranslating(true)
      try {
        const res = await fetch('/api/translate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        const data = await res.json()
        if (data.english !== undefined || data.traditional !== undefined) {
          setEpNoteTranslations({ english: data.english || '', traditional: data.traditional || '', simplified: data.simplified || '', detected: data.detected || 'unknown' })
        }
      } catch {/**/}
      finally { setEpTranslating(false) }
    }, 800)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveEpNote = async (apptId: string) => {
    const noteText = epNoteInputRef.current?.value?.trim() ?? ''
    if (!noteText) return
    setEpSavingNote(true)
    try {
      const newNote = {
        id: `note-${Date.now()}`,
        text: noteText,
        author: 'Admin',
        created_at: new Date().toISOString(),
        notes_english: epNoteTranslations?.detected !== 'english' ? (epNoteTranslations?.english ?? null) : null,
        notes_chinese: epNoteTranslations?.detected !== 'traditional' ? (epNoteTranslations?.traditional ?? null) : null,
      }
      const res = await fetch(`/api/admin/appointments/${apptId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-note', note: newNote }),
      })
      const data = await res.json()
      if (data.success) {
        setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, notes_list: data.notes_list ?? [...(a.notes_list ?? []), newNote] } : a))
        setEpNoteText('')
        setEpNoteTranslations(null)
        setEpAddingNote(false)
        showToast('✓ Note saved!')
      }
    } catch {/**/}
    finally { setEpSavingNote(false) }
  }

  const deleteEpNote = async (apptId: string, noteId: string) => {
    try {
      const res = await fetch(`/api/admin/appointments/${apptId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-note', noteId }),
      })
      const data = await res.json()
      if (data.success) {
        setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, notes_list: data.notes_list } : a))
        showToast('✓ Note deleted')
      }
    } catch {/**/}
  }

  const updateEpNote = async (apptId: string, noteId: string, text: string) => {
    if (!text.trim()) return
    setEpSavingEditNote(true)
    try {
      const res = await fetch(`/api/admin/appointments/${apptId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-note', noteId, text: text.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, notes_list: data.notes_list } : a))
        setEpEditNoteId(null)
        setEpEditNoteText('')
        showToast('✓ Note updated!')
      }
    } catch {/**/}
    finally { setEpSavingEditNote(false) }
  }

  // ── Auth gate ────────────────────────────────────────────────
  // Real login now happens on /login (username + password against the staff
  // table). If we get here unauthenticated, we're just mid-redirect there.
  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white flex flex-col items-center justify-center p-6">
        {!checkingAuth && (
          <div className="flex flex-col items-center">
            <Image src="/logo.png" alt="Kokoni Pet Grooming Salon" width={120} height={120} className="mb-3" />
            <p className="text-sm text-gray-500">Redirecting to login…</p>
          </div>
        )}
      </div>
    )
  }

  // ── Dashboard ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white px-5 py-2.5 rounded-full text-sm shadow-lg">
          {toast}
        </div>
      )}

      {/* Edit Appointment Modal */}
      {editApptId && (
        <div className="fixed inset-0 z-[99999] bg-black/40 flex items-end justify-center" onClick={() => setEditApptId(null)}>
          <div className="bg-white rounded-t-3xl p-5 w-full max-w-lg shadow-xl pb-safe" style={{paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)'}} onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
            <p className="font-bold text-gray-800 text-base mb-4">Edit Appointment</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Service</label>
                <select value={editApptDraft.service} onChange={e => setEditApptDraft(d => ({...d, service: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white">
                  {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Date</label>
                <input type="date" value={editApptDraft.date} onChange={e => setEditApptDraft(d => ({...d, date: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Time</label>
                <select value={editApptDraft.time} onChange={e => setEditApptDraft(d => ({...d, time: e.target.value}))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white">
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Notes</label>
                <textarea value={editApptDraft.notes} onChange={e => setEditApptDraft(d => ({...d, notes: e.target.value}))}
                  rows={2} placeholder="Optional notes…"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditApptId(null)}
                className="flex-1 border border-gray-200 text-gray-500 rounded-xl py-3 text-sm font-medium">Cancel</button>
              <button disabled={savingEditAppt}
                onClick={async () => {
                  setSavingEditAppt(true)
                  const res = await fetch(`/api/admin/appointments/${editApptId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'edit', service: editApptDraft.service, appointment_date: editApptDraft.date, appointment_time: editApptDraft.time, notes: editApptDraft.notes })
                  })
                  if (res.ok) {
                    showToast('✓ Appointment updated')
                    setEditApptId(null)
                    fetchAppointments()
                  } else { showToast('Failed to save') }
                  setSavingEditAppt(false)
                }}
                className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl py-3 text-sm font-bold">
                {savingEditAppt ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Name Modal */}
      {editingClientPhone && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-6" onClick={() => setEditingClientPhone(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <p className="font-bold text-gray-800 text-base mb-1">Edit Client Name</p>
            <p className="text-xs text-gray-400 mb-3">{editingClientPhone}</p>
            <input
              autoFocus
              type="text"
              value={editingClientNameVal}
              onChange={e => setEditingClientNameVal(e.target.value)}
              placeholder="First and last name"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-300 mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setEditingClientPhone(null)}
                className="flex-1 border border-gray-200 text-gray-500 rounded-xl py-2.5 text-sm font-medium">
                Cancel
              </button>
              <button
                disabled={savingClientName || !editingClientNameVal.trim()}
                onClick={async () => {
                  setSavingClientName(true)
                  const res = await fetch('/api/admin/clients', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: editingClientPhone, name: editingClientNameVal.trim() })
                  })
                  if (res.ok) {
                    setCustomers(prev => prev.map(c => c.phone === editingClientPhone ? { ...c, name: editingClientNameVal.trim() } : c))
                    showToast('✓ Name updated')
                    setEditingClientPhone(null)
                  } else {
                    showToast('Failed to save')
                  }
                  setSavingClientName(false)
                }}
                className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold">
                {savingClientName ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header — white with black title (groomer.io style) */}
      <div className="bg-white border-b border-gray-200 px-4 flex items-center justify-between sticky top-0 z-40" style={{paddingTop: 'calc(env(safe-area-inset-top) + 12px)', paddingBottom: '12px'}}>
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Kokoni" width={36} height={36} className="rounded-full" />
          <h1 className="font-bold text-gray-900 text-lg leading-tight">
            {tab === 'today' ? "Today's Schedule" :
             tab === 'pending' ? 'Pending Requests' :
             tab === 'upcoming' ? 'Upcoming' :
             tab === 'calendar' ? new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) :
             tab === 'customers' ? 'Clients' :
             tab === 'checkout' ? 'Check Out' :
             tab === 'settings' ? 'Settings' : 'All'}
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <ChatIconButton />
          <button
            onClick={() => { clearAuth('admin'); setAuthed(false); router.push('/login') }}
            className="text-xs text-gray-400 hover:text-gray-600 px-2"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto pb-24">

          {/* ── TODAY VIEW ─────────────────────────────────── */}
          {tab === 'today' && (() => {
            // Helpers
            const parseApptTime = (dateStr: string, timeStr: string) => {
              try { return parseApptTimeLA(dateStr, timeStr) } catch { return new Date(0) }
            }
            const fmtTs = (iso: string | null | undefined) => {
              if (!iso) return null
              return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: SALON_TZ })
            }
            const nowMs = Date.now()
            const isOverdue = (a: Appointment) => !a.grooming_status && parseApptTime(a.appointment_date, a.appointment_time).getTime() < nowMs - 5 * 60000

            const coming = appointments.filter(a => !a.grooming_status && a.status !== 'completed')
            const working = appointments.filter(a =>
              a.status !== 'completed' &&
              (a.grooming_status === 'waiting' || a.grooming_status === 'in_progress' || a.grooming_status === 'incare' || a.grooming_status === 'ready')
            )
            const done = appointments.filter(a => a.status === 'completed' || a.grooming_status === 'done')

            // Open/close the edit drawer for an appointment
            const openEdit = (appt: Appointment) => {
              if (expandedApptId === appt.id) {
                setExpandedApptId(null)
                setEditDraft(null)
                setExpandedPetTags([])
              } else {
                setExpandedApptId(appt.id)
                if (appt.pets?.id) {
                  setExpandedPetTags([])
                  fetch(`/api/admin/pet-tags?pet_id=${appt.pets.id}`)
                    .then(r => r.json())
                    .then(d => setExpandedPetTags((d.tags ?? []) as PetTag[]))
                    .catch(() => {/**/})
                }
                setEditDraft({
                  petName: appt.pets?.name ?? '',
                  petBreed: appt.pets?.breed ?? '',
                  petWeight: appt.pets?.weight ?? '',
                  payAmount: appt.payment_amount != null ? String(appt.payment_amount) : '',
                  tipAmount: appt.tip_amount != null ? String(appt.tip_amount) : '',
                  payMethod: appt.payment_method ?? '',
                  payStatus: appt.payment_status ?? '',
                  notes: appt.notes ?? '',
                  service: appt.service ?? '',
                  apptStatus: appt.status ?? '',
                })
                const existingAddons = (appt.notes_list ?? [])
                  .filter((n: NoteEntry) => n.is_addon)
                  .map((n: NoteEntry) => ({ id: n.id, name: n.text, price: n.price ?? '' }))
                const addonSum = existingAddons.reduce((s: number, a: {price:string}) => s + (parseFloat(a.price) || 0), 0)
                const rawTotal = appt.payment_amount != null ? parseFloat(String(appt.payment_amount)) : 0
                // payment_amount is post-discount; add the saved discount back to rebuild the pre-discount base
                const savedDiscount = parseFloat((appt as { discount_amount?: string | null }).discount_amount || '') || 0
                const baseCalc = rawTotal > 0 ? Math.max(0, rawTotal + savedDiscount - addonSum).toString() : (appt.payment_amount != null ? String(appt.payment_amount) : '')
                setEditDraftBasePrice(baseCalc)
                setEditDraftBaseTier((appt as { size_tier?: string | null }).size_tier || '')  // restore saved tier
                setEditDraftAddOns(existingAddons)
                setEditDraftAddonDraft({ text: '', price: '' })
                {
                  const dl = (appt as { discount_label?: string | null }).discount_label || ''
                  const dp = parseFloat((appt as { discount_percent?: string | null }).discount_percent || '')
                  const m = availableCoupons.find(c => c.name === dl) ?? availableCoupons.find(c => !isNaN(dp) && c.discount_type === 'percent' && c.discount_value === dp)
                  setEditDraftCouponId(savedDiscount > 0 ? (m?.id ?? null) : null)
                }
                setMobileIsFirstTime(false)
                if (appt.pets?.id) fetch(`/api/groomer/last-payment?pet_id=${appt.pets.id}&exclude_id=${appt.id}`).then(r => r.json()).then(d => setMobileIsFirstTime(!d?.amount)).catch(() => {})
                setEditDraftTotalSaved(!!appt.payment_amount)
                setEpAddingNote(false)
                setEpNoteText('')
                setEpNoteTranslations(null)
                setEpEditNoteId(null)
                setEpEditNoteText('')
              }
            }

            // Expandable edit panel used in all three sections
            const EditPanel = ({ appt }: { appt: Appointment }) => {
              if (expandedApptId !== appt.id || !editDraft) return null
              return (
                <div className="bg-slate-50 border-t border-slate-200 px-4 pt-4 pb-8 space-y-4">
                  {/* Owner Info */}
                  {appt.clients && (
                    <div className="bg-white rounded-xl border border-gray-200 px-3 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Owner Info</p>
                      <p className="text-sm font-bold text-gray-800 mb-2">{appt.clients.name}</p>
                      {appt.clients.phone && (
                        <div className="flex gap-2">
                          <a href={`tel:${appt.clients.phone}`}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-lg">
                            📞 {appt.clients.phone}
                          </a>
                          <a href={`sms:${appt.clients.phone}`}
                            className="flex items-center justify-center bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold px-4 py-2 rounded-lg">
                            💬
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Appointment */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Appointment</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-500 font-medium">Service</label>
                        <select value={editDraft.service}
                          onChange={e => setEditDraft(d => d ? { ...d, service: e.target.value } : d)}
                          className="mt-0.5 w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white">
                          <option value="simply_cute">Simply Cute</option>
                          <option value="bath_brush">Bath &amp; Brush</option>
                          <option value="asian_fusion">Asian Fusion</option>
                          <option value="nail_trim">Nail Trim</option>
                          <option value="top_dog">Top Dog</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 font-medium">Status</label>
                        <select value={editDraft.apptStatus}
                          onChange={e => setEditDraft(d => d ? { ...d, apptStatus: e.target.value } : d)}
                          className="mt-0.5 w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white">
                          <option value="pending">Pending</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="no_show">No Show</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  {/* Pet info */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Pet Info</p>
                    <div className="mb-2">
                      <label className="text-[10px] text-gray-500 font-medium">Name</label>
                      <input value={editDraft.petName}
                        onChange={e => setEditDraft(d => d ? { ...d, petName: e.target.value } : d)}
                        placeholder="Pet name"
                        className="mt-0.5 w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-500 font-medium">Breed</label>
                        <input value={editDraft.petBreed}
                          onChange={e => setEditDraft(d => d ? { ...d, petBreed: e.target.value } : d)}
                          placeholder="e.g. Shih Tzu"
                          className="mt-0.5 w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white" />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 font-medium">Weight (lbs)</label>
                        <input value={editDraft.petWeight}
                          onChange={e => setEditDraft(d => d ? { ...d, petWeight: e.target.value } : d)}
                          placeholder="e.g. 12"
                          className="mt-0.5 w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white" />
                      </div>
                    </div>

                    {/* Tags */}
                    {appt.pets?.id && (
                      <div className="mt-2.5">
                        <label className="text-[10px] text-gray-500 font-medium">🏷️ Tags</label>
                        <div className="flex items-center gap-1 flex-wrap mt-1">
                          {expandedPetTags.map(t => (
                            <TagPill
                              key={t.id}
                              tag={t}
                              size="xs"
                              onRemove={async () => {
                                await fetch('/api/admin/pet-tags', {
                                  method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ pet_id: appt.pets!.id, tag_id: t.id }),
                                })
                                setExpandedPetTags(prev => prev.filter(x => x.id !== t.id))
                              }}
                            />
                          ))}
                          <TagPicker
                            petId={appt.pets.id}
                            currentTags={expandedPetTags}
                            onChange={setExpandedPetTags}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Payment — groomer-style pricing */}
                  {(() => {
                    const svcDef = services.find(s => s.id === appt.service)
                    const svcName = svcDef?.name ?? serviceMap[appt.service] ?? appt.service
                    const tiers = (svcDef?.tiers ?? []).filter((t: {label:string;price:string}) => t.label)
                    const otherServices = services.filter(s => s.id !== appt.service)
                    const addOnTotal = editDraftAddOns.reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0)
                    const baseAmt = parseFloat(editDraftBasePrice) || 0
                    const subtotalAmt = baseAmt + addOnTotal
                    const editDraftCoupon = availableCoupons.find(c => c.id === editDraftCouponId) ?? null
                    const discountAmt = editDraftCoupon
                      ? (editDraftCoupon.discount_type === 'percent' ? Math.round(subtotalAmt * editDraftCoupon.discount_value / 100 * 100) / 100 : Math.min(editDraftCoupon.discount_value, subtotalAmt))
                      : 0
                    const grandTotal = Math.round((subtotalAmt - discountAmt) * 100) / 100
                    return (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Payment</p>
                        <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
                          {/* Size tiers */}
                          {tiers.length > 0 && (
                            <>
                              <p className="text-xs text-gray-400">Tap a size ↓</p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {tiers.map((tier: {label:string;price:string}, i: number) => {
                                  const explicitMatch = !!editDraftBaseTier && editDraftBaseTier === tier.label && !!tier.price
                                  // On reopen the chosen tier label isn't saved; highlight when the price uniquely matches one tier.
                                  const uniquePriceMatch = !!tier.price && !editDraftBaseTier && editDraftBasePrice === tier.price
                                    && tiers.filter((t: {price:string}) => t.price === tier.price).length === 1
                                  const isSelected = explicitMatch || uniquePriceMatch
                                  return (
                                    <button key={i}
                                      onClick={() => { if (tier.price) { setEditDraftBasePrice(isSelected ? '' : tier.price); setEditDraftBaseTier(isSelected ? '' : tier.label); setEditDraftTotalSaved(false) } }}
                                      disabled={!tier.price}
                                      className={`px-2 py-2 rounded-xl text-xs font-semibold border transition-all ${
                                        isSelected ? 'bg-sky-500 text-white border-sky-500 shadow-sm'
                                          : tier.price ? 'bg-white text-gray-700 border-gray-200 hover:border-sky-300'
                                          : 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                                      }`}>
                                      <div>{tier.label}</div>
                                      {tier.price && <div className="font-bold mt-0.5">${tier.price}</div>}
                                    </button>
                                  )
                                })}
                              </div>
                            </>
                          )}

                          {/* Custom price */}
                          <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${
                            editDraftBasePrice && !editDraftBaseTier
                              ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-gray-50'
                          }`}>
                            <span className="text-xs font-medium text-gray-500 shrink-0">Custom $</span>
                            <input
                              type="text" inputMode="numeric" pattern="[0-9]*"
                              placeholder="or type a price…"
                              value={editDraftBaseTier ? '' : editDraftBasePrice}
                              onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setEditDraftBasePrice(v); setEditDraftBaseTier(''); setEditDraftTotalSaved(false) }}
                              onFocus={() => { if (editDraftBaseTier) { setEditDraftBasePrice(''); setEditDraftBaseTier(''); setEditDraftTotalSaved(false) } }}
                              className="flex-1 text-sm font-bold text-gray-800 bg-transparent focus:outline-none"
                            />
                          </div>

                          {/* Add-on services */}
                          {(otherServices.length > 0 || editDraftAddOns.length > 0) && (
                            <div className="border-t border-gray-100 pt-2">
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Add-on Services</p>
                              {editDraftAddOns.length > 0 && (
                                <div className="space-y-1.5 mb-2">
                                  {editDraftAddOns.map(addon => (
                                    <div key={addon.id} className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
                                      <span className="text-xs font-semibold text-sky-800 flex-1">{addon.name}</span>
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-gray-500">$</span>
                                        <input type="text" inputMode="numeric" pattern="[0-9]*" value={addon.price}
                                          onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setEditDraftAddOns(prev => prev.map(a => a.id === addon.id ? { ...a, price: v } : a)); setEditDraftTotalSaved(false) }}
                                          className="w-14 text-sm font-bold text-sky-700 bg-transparent focus:outline-none text-right" />
                                      </div>
                                      <button onClick={() => { setEditDraftAddOns(prev => prev.filter(a => a.id !== addon.id)); setEditDraftTotalSaved(false) }}
                                        className="text-gray-300 hover:text-rose-400 text-base font-bold ml-1">✕</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {otherServices
                                  .filter((s: {id:string}) => !editDraftAddOns.find(a => a.id === s.id))
                                  .map((s: {id:string;name:string;tiers?:{label:string;price:string}[]}) => (
                                    <button key={s.id}
                                      onClick={() => {
                                        const defaultPrice = s.tiers?.find(t => t.price)?.price ?? ''
                                        setEditDraftAddOns(prev => [...prev, { id: s.id, name: s.name ?? serviceMap[s.id] ?? s.id, price: defaultPrice }])
                                        setEditDraftTotalSaved(false)
                                      }}
                                      className="text-xs bg-gray-100 hover:bg-sky-100 text-gray-600 hover:text-sky-700 px-2.5 py-1.5 rounded-lg font-medium transition-colors">
                                      + {s.name ?? serviceMap[s.id] ?? s.id}
                                    </button>
                                  ))}
                              </div>
                              <div className="flex gap-1.5">
                                <input
                                  value={editDraftAddonDraft.text}
                                  onChange={e => setEditDraftAddonDraft(prev => ({ ...prev, text: e.target.value }))}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' && editDraftAddonDraft.text.trim()) {
                                      setEditDraftAddOns(prev => [...prev, { id: Date.now().toString(), name: editDraftAddonDraft.text.trim(), price: editDraftAddonDraft.price }])
                                      setEditDraftAddonDraft({ text: '', price: '' })
                                      setEditDraftTotalSaved(false)
                                    }
                                  }}
                                  placeholder="Custom add-on…"
                                  className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                                />
                                <input
                                  value={editDraftAddonDraft.price}
                                  onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setEditDraftAddonDraft(prev => ({ ...prev, price: v })) }}
                                  placeholder="$" type="text" inputMode="numeric"
                                  className="w-12 border border-gray-200 rounded-xl px-2 py-1.5 text-xs text-center bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                                />
                                <button
                                  onClick={() => {
                                    if (!editDraftAddonDraft.text.trim()) return
                                    setEditDraftAddOns(prev => [...prev, { id: Date.now().toString(), name: editDraftAddonDraft.text.trim(), price: editDraftAddonDraft.price }])
                                    setEditDraftAddonDraft({ text: '', price: '' })
                                    setEditDraftTotalSaved(false)
                                  }}
                                  disabled={!editDraftAddonDraft.text.trim()}
                                  className="px-2.5 py-1.5 bg-sky-500 text-white text-xs font-bold rounded-xl disabled:opacity-40">+</button>
                              </div>
                            </div>
                          )}

                          {/* Discount code selector (shared; first-visit-only gated) */}
                          {subtotalAmt > 0 && (
                            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 border-2 ${editDraftCouponId ? 'bg-pink-50 border-pink-300' : 'bg-gray-50 border-gray-200'}`}>
                              <span className="text-xs">🎟️</span>
                              <select value={editDraftCouponId ?? ''} onChange={e => { setEditDraftCouponId(e.target.value || null); setEditDraftTotalSaved(false) }}
                                className={`flex-1 text-xs font-semibold bg-transparent focus:outline-none ${editDraftCouponId ? 'text-pink-700' : 'text-gray-400'}`}>
                                <option value="">Apply discount…</option>
                                {availableCoupons.map(c => {
                                  const blocked = c.first_visit_only && !mobileIsFirstTime
                                  return <option key={c.id} value={c.id} disabled={blocked}>{c.name} — {c.discount_type === 'percent' ? `${c.discount_value}% off` : `$${c.discount_value} off`}{blocked ? ' · first visit only' : ''}</option>
                                })}
                              </select>
                              {editDraftCouponId && <button onClick={() => { setEditDraftCouponId(null); setEditDraftTotalSaved(false) }} className="text-pink-400 text-base leading-none">✕</button>}
                            </div>
                          )}

                          {/* Total breakdown */}
                          {(editDraftBasePrice || editDraftAddOns.length > 0) && (
                            <div className="bg-gray-50 rounded-xl px-3 py-2 space-y-1 border border-gray-100">
                              {editDraftBasePrice && (
                                <div className="flex justify-between text-xs text-gray-500">
                                  <span>{svcName}</span>
                                  <span className="font-semibold">${editDraftBasePrice}</span>
                                </div>
                              )}
                              {editDraftAddOns.map(a => (
                                <div key={a.id} className="flex justify-between text-xs text-gray-500">
                                  <span>{a.name}</span>
                                  <span className="font-semibold">${a.price || '0'}</span>
                                </div>
                              ))}
                              {discountAmt > 0 && (
                                <div className="flex justify-between text-xs">
                                  <span className="text-pink-500 font-semibold">🎉 20% off</span>
                                  <span className="font-bold text-pink-500">−${discountAmt.toFixed(2)}</span>
                                </div>
                              )}
                              <div className="flex justify-between text-sm font-bold text-gray-800 pt-1 border-t border-gray-200">
                                <span>Total</span>
                                <span className={editDraftTotalSaved && grandTotal > 0 ? 'text-emerald-600' : discountAmt > 0 ? 'text-pink-600' : 'text-gray-800'}>${grandTotal.toFixed(2)}</span>
                              </div>
                            </div>
                          )}

                          {/* Save Total */}
                          <button
                            disabled={grandTotal <= 0 || savingEditDraftPayment}
                            onClick={async () => {
                              if (grandTotal <= 0) return
                              const amount = grandTotal.toString()
                              setSavingEditDraftPayment(true)
                              try {
                                const res = await fetch(`/api/admin/appointments/${appt.id}`, {
                                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'record-payment', payment_amount: amount, addons: editDraftAddOns, size_tier: editDraftBaseTier || null,
                                    discount_label: editDraftCoupon ? editDraftCoupon.name : null,
                                    discount_percent: editDraftCoupon?.discount_type === 'percent' ? String(editDraftCoupon.discount_value) : null,
                                    discount_amount: discountAmt > 0 ? discountAmt.toFixed(2) : null }),
                                })
                                if ((await res.json()).success) {
                                  setEditDraftTotalSaved(true)
                                  const addonNotes: NoteEntry[] = editDraftAddOns.map(a => ({ id: a.id, text: a.name, price: a.price, is_addon: true, author: 'system', created_at: new Date().toISOString() }))
                                  setAppointments(prev => prev.map(a => {
                                    if (a.id !== appt.id) return a
                                    const nonAddonNotes = (a.notes_list ?? []).filter(n => !n.is_addon)
                                    return { ...a, payment_amount: amount, size_tier: editDraftBaseTier || null,
                                      discount_label: editDraftCoupon ? editDraftCoupon.name : null,
                                      discount_percent: editDraftCoupon?.discount_type === 'percent' ? String(editDraftCoupon.discount_value) : null,
                                      discount_amount: discountAmt > 0 ? discountAmt.toFixed(2) : null,
                                      notes_list: [...nonAddonNotes, ...addonNotes] }
                                  }))
                                  showToast('✓ Total saved!')
                                }
                              } catch {/**/}
                              finally { setSavingEditDraftPayment(false) }
                            }}
                            className={`w-full py-2.5 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors ${
                              grandTotal <= 0 ? 'bg-gray-300' : editDraftTotalSaved ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-sky-500 hover:bg-sky-600'
                            }`}>
                            {savingEditDraftPayment ? '⏳ Saving…' : grandTotal > 0 ? (editDraftTotalSaved ? `✓ Saved · $${grandTotal}` : `💾 Save Total · $${grandTotal}`) : 'Select a size first'}
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                  {/* Notes — groomer-style list */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Notes</p>
                    <div className="space-y-2">
                      {/* Existing notes */}
                      {(appt.notes_list ?? []).filter((n: {is_addon?:boolean}) => !n.is_addon).map((note: {id:string;text:string;author?:string;created_at:string}) => (
                        <div key={note.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                {(note.author?.[0] ?? '?').toUpperCase()}
                              </div>
                              <span className="text-xs font-semibold text-gray-700">{note.author ?? 'Staff'}</span>
                              <span className="text-gray-300">·</span>
                              <span className="text-[10px] text-gray-400">
                                {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                {' · '}
                                {new Date(note.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: SALON_TZ })}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => { setEpEditNoteId(note.id); setEpEditNoteText(note.text) }}
                                disabled={epSavingNote || epSavingEditNote}
                                className="text-[10px] text-sky-400 hover:text-sky-600 px-2 py-1 rounded hover:bg-sky-50">✏️</button>
                              <button onClick={() => { if (confirm('Delete this note?')) deleteEpNote(appt.id, note.id) }}
                                disabled={epSavingNote || epSavingEditNote}
                                className="text-[10px] text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">🗑️</button>
                            </div>
                          </div>
                          <div className="px-3 py-2.5">
                            {epEditNoteId === note.id ? (
                              <div className="space-y-1.5">
                                <textarea value={epEditNoteText} onChange={e => setEpEditNoteText(e.target.value)}
                                  rows={2} autoFocus
                                  className="w-full border border-sky-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none" />
                                <div className="flex gap-1.5">
                                  <button onClick={() => updateEpNote(appt.id, note.id, epEditNoteText)}
                                    disabled={epSavingEditNote || !epEditNoteText.trim()}
                                    className="flex-1 py-1.5 bg-sky-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                                    {epSavingEditNote ? 'Saving…' : '💾 Save'}
                                  </button>
                                  <button onClick={() => { setEpEditNoteId(null); setEpEditNoteText('') }}
                                    className="px-3 py-1.5 text-gray-500 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">{note.text}</p>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Add note form */}
                      {epAddingNote ? (
                        <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-gray-600">✏️ Add Note</p>
                            <span className="text-[10px] text-gray-400 flex items-center gap-1">
                              {epTranslating && <span className="inline-block w-2.5 h-2.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />}
                              {epTranslating ? 'Translating…' : epNoteTranslations ? '✨ Translated' : 'Type in any language'}
                            </span>
                          </div>
                          <textarea
                            ref={epNoteInputRef}
                            onChange={e => {
                              if (!epIsComposingRef.current) triggerEpAutoTranslate(e.target.value)
                            }}
                            onCompositionStart={() => { epIsComposingRef.current = true }}
                            onCompositionEnd={e => {
                              epIsComposingRef.current = false
                              const val = (e.target as HTMLTextAreaElement).value
                              triggerEpAutoTranslate(val)
                            }}
                            rows={3} autoFocus placeholder="Type in English, 繁體中文, or 简体中文…"
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none" />
                          {epNoteTranslations && (
                            <div className="bg-violet-50 border border-violet-100 rounded-lg p-2.5 space-y-1">
                              <p className="text-[10px] font-semibold text-violet-500">✨ Will save in all languages</p>
                              {epNoteTranslations.detected !== 'english' && epNoteTranslations.english && (
                                <div className="text-[10px] text-gray-600"><span className="font-semibold text-gray-400">🇺🇸 </span>{epNoteTranslations.english}</div>
                              )}
                              {epNoteTranslations.detected !== 'traditional' && epNoteTranslations.traditional && (
                                <div className="text-[10px] text-gray-600"><span className="font-semibold text-gray-400">🇹🇼 </span>{epNoteTranslations.traditional}</div>
                              )}
                              {epNoteTranslations.simplified && epNoteTranslations.detected !== 'simplified' && (
                                <div className="text-[10px] text-gray-600"><span className="font-semibold text-gray-400">🇨🇳 </span>{epNoteTranslations.simplified}</div>
                              )}
                            </div>
                          )}
                          <div className="flex gap-1.5">
                            <button onClick={() => saveEpNote(appt.id)}
                              disabled={epSavingNote || epTranslating}
                              className="flex-1 py-1.5 bg-sky-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                              {epSavingNote ? 'Saving…' : epTranslating ? '✨ Translating…' : '💾 Save Note'}
                            </button>
                            <button onClick={() => { setEpAddingNote(false); setEpNoteText(''); setEpNoteTranslations(null) }}
                              className="px-3 py-1.5 text-gray-500 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { if (epNoteTimerRef.current) clearTimeout(epNoteTimerRef.current); epIsComposingRef.current = false; setEpAddingNote(true); setEpNoteText(''); setEpNoteTranslations(null) }}
                          className="w-full py-2 rounded-xl text-xs font-semibold border-2 border-dashed border-gray-200 text-gray-400 hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50 transition-colors">
                          + Add Note
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => saveEditDraft(appt)} disabled={savingEdit}
                      className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-bold py-3 rounded-xl transition-colors">
                      {savingEdit ? 'Saving…' : 'Save Changes'}
                    </button>
                    <button onClick={() => { setExpandedApptId(null); setEditDraft(null) }}
                      className="px-6 text-sm font-semibold text-gray-500 border border-gray-200 rounded-xl bg-white hover:bg-gray-50">
                      Cancel
                    </button>
                  </div>
                </div>
              )
            }

            // Section header component
            const SectionHeader = ({ label, count }: { label: string; count: number }) => (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-sky-50 text-sky-700 text-xs font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-sky-100">
                <span>{label}</span>
                {count > 0 && <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-bold">{count}</span>}
              </div>
            )

            // Timeline row: compact horizontal display of key timestamps
            const TimelineRow = ({ appt, isDone }: { appt: Appointment; isDone: boolean }) => {
              const steps = [
                { label: 'In', time: fmtTs(appt.checked_in_at), color: isDone ? 'text-gray-500 bg-gray-100' : 'text-gray-700 bg-gray-100' },
                { label: 'Start', time: fmtTs(appt.grooming_started_at), color: isDone ? 'text-gray-500 bg-gray-100' : 'text-sky-700 bg-sky-50' },
                { label: 'Done', time: fmtTs(appt.grooming_finished_at), color: isDone ? 'text-gray-500 bg-gray-100' : 'text-green-700 bg-green-50' },
                { label: 'Out', time: fmtTs(appt.checked_out_at), color: 'text-pink-600 bg-pink-50' },
              ]
              const hasAny = steps.some(s => s.time)
              if (!hasAny) return null
              return (
                <div className="flex items-center gap-1 mt-2 flex-wrap">
                  {steps.map((s, i) => s.time ? (
                    <span key={i} className="flex items-center gap-0.5">
                      {i > 0 && <span className="text-gray-300 text-[10px] px-0.5">›</span>}
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${s.color}`}>{s.label}: {s.time}</span>
                    </span>
                  ) : null)}
                </div>
              )
            }

            // Groomer chips — unique groomers/bathers with count
            const groomerCounts: Record<string, number> = {}
            appointments.forEach(a => {
              if (a.assigned_groomer) groomerCounts[a.assigned_groomer] = (groomerCounts[a.assigned_groomer] || 0) + 1
              if (a.assigned_bather && a.assigned_bather !== a.assigned_groomer) groomerCounts[a.assigned_bather] = (groomerCounts[a.assigned_bather] || 0) + 1
            })
            const groomerChips = Object.entries(groomerCounts).sort((a, b) => b[1] - a[1])

            // Search + groomer filter
            const searchLower = todaySearch.toLowerCase()
            const filterAppts = (list: typeof appointments) =>
              list.filter(a => {
                const matchSearch = !searchLower ||
                  (a.clients?.name ?? '').toLowerCase().includes(searchLower) ||
                  (a.pets?.name ?? '').toLowerCase().includes(searchLower)
                const matchGroomer = !groomerFilter ||
                  a.assigned_groomer === groomerFilter ||
                  a.assigned_bather === groomerFilter
                return matchSearch && matchGroomer
              })

            // Desktop-style grooming-status groupings
            const byTime2 = (a: Appointment, b: Appointment) =>
              parseApptTime(a.appointment_date, a.appointment_time).getTime() -
              parseApptTime(b.appointment_date, b.appointment_time).getTime()

            const sectionedGroups = filterAppts([
              ...appointments.filter(a => isOverdue(a)),
              ...appointments.filter(a => a.grooming_status === 'waiting'),
              ...appointments.filter(a => a.grooming_status === 'incare' || a.grooming_status === 'in_progress'),
              ...appointments.filter(a => a.grooming_status === 'ready'),
              ...appointments.filter(a => !a.grooming_status && !isOverdue(a) && a.status !== 'completed'),
              ...appointments.filter(a => a.grooming_status === 'done' || a.status === 'completed'),
            ].filter((a, i, arr) => arr.findIndex(b => b.id === a.id) === i)) // dedupe

            const groups: { label: string; emoji: string; headerCls: string; items: Appointment[] }[] = [
              {
                label: 'Late — Needs Check In',
                emoji: '🔴',
                headerCls: 'bg-red-50 border-red-100 text-red-700',
                items: filterAppts(appointments.filter(a => isOverdue(a)).sort(byTime2)),
              },
              {
                label: 'Coming Up — Tap to Check In',
                emoji: '📅',
                headerCls: 'bg-blue-50 border-blue-100 text-blue-700',
                items: filterAppts(appointments.filter(a => !a.grooming_status && !isOverdue(a) && a.status !== 'completed').sort(byTime2)),
              },
              {
                label: 'Checked In',
                emoji: '⏳',
                headerCls: 'bg-amber-50 border-amber-100 text-amber-700',
                items: filterAppts(appointments.filter(a => a.grooming_status === 'waiting').sort(byTime2)),
              },
              {
                label: 'In Good Hands 🐾',
                emoji: '✂️',
                headerCls: 'bg-sky-50 border-sky-100 text-sky-700',
                items: filterAppts(appointments.filter(a => a.grooming_status === 'incare' || a.grooming_status === 'in_progress').sort(byTime2)),
              },
              {
                label: 'Ready to Pick Up',
                emoji: '🔔',
                headerCls: 'bg-green-50 border-green-100 text-green-700',
                items: filterAppts(appointments.filter(a => a.grooming_status === 'ready').sort(byTime2)),
              },
              {
                label: 'Done',
                emoji: '🎉',
                headerCls: 'bg-emerald-50 border-emerald-100 text-emerald-700',
                items: filterAppts(appointments.filter(a => a.grooming_status === 'done' || (!a.grooming_status && a.status === 'completed')).sort(byTime2)),
              },
            ].filter(g => g.items.length > 0)

            // Stats for top bar
            const waitingCount = appointments.filter(a => a.grooming_status === 'waiting').length
            const incareCount  = appointments.filter(a => a.grooming_status === 'incare' || a.grooming_status === 'in_progress').length
            const readyCount   = appointments.filter(a => a.grooming_status === 'ready').length
            const doneCount    = appointments.filter(a => a.grooming_status === 'done' || a.status === 'completed').length
            const lateCount    = appointments.filter(a => isOverdue(a)).length

            // Compact appointment row used inside each group card
            const ApptRow = ({ appt }: { appt: Appointment }) => {
              const gs = appt.grooming_status
              const petName = appt.pets?.name ?? '—'
              const ownerName = appt.clients?.name ?? ''
              const isLate = isOverdue(appt)
              const isLoading = actionLoading !== null
              const isExpanded = expandedApptId === appt.id

              let groomTime = ''
              if (appt.grooming_started_at && appt.grooming_finished_at) {
                const mins = Math.round((new Date(appt.grooming_finished_at).getTime() - new Date(appt.grooming_started_at).getTime()) / 60000)
                const h = Math.floor(mins / 60), m = mins % 60
                groomTime = h > 0 ? `${h}h ${m}m` : `${m}m`
              } else if (appt.grooming_started_at) {
                const mins = Math.round((nowMs - new Date(appt.grooming_started_at).getTime()) / 60000)
                const h = Math.floor(mins / 60), m = mins % 60
                groomTime = h > 0 ? `${h}h ${m}m` : `${m}m`
              }

              const isDone = gs === 'done' || appt.status === 'completed'

              return (
                <div className={isDone ? 'opacity-70' : ''}>
                  <div className="px-3 py-3 flex gap-3">
                    {/* Pet photo */}
                    <div className="shrink-0">
                      {appt.pets?.photo_url
                        ? <img src={appt.pets.photo_url} className="w-11 h-11 rounded-xl object-cover border border-gray-100 shadow-sm" alt="" />
                        : <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-xl">🐶</div>}
                    </div>
                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      {/* Row 1: name + time */}
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="font-bold text-gray-900 text-sm">{petName}{appt.payment_amount ? <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white text-[10px] font-bold leading-none">$</span> : null}</span>
                          <span className="text-xs text-gray-400">{ownerName.split(' ')[0]}</span>
                          {isLate && !gs && <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">LATE</span>}
                          {appt.status === 'pending' && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">PENDING</span>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-semibold text-gray-500">{appt.appointment_time.replace(':00 ', ' ')}</p>
                          {groomTime && <p className={`text-[11px] font-bold ${appt.grooming_finished_at ? 'text-emerald-600' : 'text-sky-600'}`}>⏱ {groomTime}</p>}
                        </div>
                      </div>
                      {/* Row 2: breed · weight */}
                      {(appt.pets?.breed || appt.pets?.weight) && (
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {appt.pets?.breed && <p className="text-[11px] text-gray-400">{appt.pets.breed}</p>}
                          {appt.pets?.weight && (
                            <span className="text-[11px] font-black text-white bg-orange-400 px-2 py-0.5 rounded-full">⚖️ {appt.pets.weight}</span>
                          )}
                        </div>
                      )}
                      {/* Row 3: service + staff tags */}
                      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                        <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{serviceMap[appt.service] ?? appt.service}</span>
                        {appt.assigned_groomer && <span className="text-[11px] font-bold text-white bg-rose-500 px-2 py-0.5 rounded-full">✂️ {appt.assigned_groomer.split(' ')[0]}</span>}
                        {appt.assigned_bather  && <span className="text-[11px] font-bold text-white bg-sky-500 px-2 py-0.5 rounded-full">🛁 {appt.assigned_bather.split(' ')[0]}</span>}
                        {isDone && (appt.payment_status === 'paid'
                          ? <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded ml-auto">✓ ${appt.payment_amount}</span>
                          : appt.payment_status === 'cash_pending'
                            ? <span className="text-[11px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded ml-auto">💵 Cash pending</span>
                            : <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded ml-auto">Unpaid</span>)}
                      </div>
                      {/* Timeline row */}
                      <TimelineRow appt={appt} isDone={isDone} />
                      {/* Action buttons */}
                      <div className="flex gap-1.5 mt-2.5 items-center flex-wrap">
                        {!gs && appt.status === 'pending' && (
                          <button onClick={() => handleAction(appt.id, 'confirm')} disabled={isLoading}
                            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                            Confirm
                          </button>
                        )}
                        {!gs && !isDone && (
                          <button onClick={() => handleAction(appt.id, 'start')} disabled={isLoading}
                            className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                            ✓ Check In
                          </button>
                        )}
                        {gs === 'waiting' && (
                          <button onClick={() => advanceGroomingStatus(appt.id, 'incare')} disabled={isLoading}
                            className="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                            Start Groom →
                          </button>
                        )}
                        {(gs === 'incare' || gs === 'in_progress') && (
                          <button onClick={() => advanceGroomingStatus(appt.id, 'ready')} disabled={isLoading}
                            className="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                            Mark Ready →
                          </button>
                        )}
                        {gs === 'ready' && (
                          <button onClick={() => advanceGroomingStatus(appt.id, 'done')} disabled={isLoading}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                            ✓ Check Out
                          </button>
                        )}
                        {!gs && !isDone && (
                          <>
                            <button onClick={() => handleAction(appt.id, 'decline')} disabled={isLoading}
                              className="text-gray-300 hover:text-rose-500 text-base font-bold px-1 leading-none" title="Decline">×</button>
                            <button onClick={() => { if (confirm('Delete this appointment?')) deleteAppointment(appt.id) }} disabled={!!deletingApptId}
                              className="text-gray-300 hover:text-rose-500 text-sm px-1" title="Delete">🗑</button>
                          </>
                        )}
                        <button onClick={() => openEdit(appt)}
                          className={`ml-auto text-xs px-2.5 py-1.5 rounded-lg font-medium border transition-colors ${isExpanded ? 'bg-sky-500 text-white border-sky-500' : 'text-sky-600 border-sky-200 bg-sky-50'}`}>
                          {isExpanded ? '✕ Close' : '✏️ Edit'}
                        </button>
                      </div>
                    </div>
                  </div>
                  <EditPanel appt={appt} />
                </div>
              )
            }

            return (
              <div>
                {/* Search bar */}
                <div className="px-3 py-2 bg-white border-b border-gray-200 flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400 shrink-0">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  <input type="text" placeholder="Search pets or owners..."
                    value={todaySearch} onChange={e => setTodaySearch(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 focus:outline-none" />
                  {todaySearch && <button onClick={() => setTodaySearch('')} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>}
                </div>

                {/* Groomer filter chips */}
                {groomerChips.length > 0 && (
                  <div className="flex gap-2 px-3 py-2 bg-white border-b border-gray-200 overflow-x-auto">
                    <button
                      onClick={() => setGroomerFilter(null)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                        groomerFilter === null
                          ? 'bg-sky-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      All · {appointments.length}
                    </button>
                    {groomerChips.map(([name, count]) => (
                      <button
                        key={name}
                        onClick={() => setGroomerFilter(g => g === name ? null : name)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                          groomerFilter === name
                            ? 'bg-violet-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {name.split(' ')[0]} · {count}
                      </button>
                    ))}
                  </div>
                )}

                {/* Stats bar — matches desktop Grooming Board */}
                <div className="grid grid-cols-4 gap-px bg-gray-200 border-b border-gray-200">
                  {[
                    { label: 'Waiting',   value: waitingCount, color: waitingCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-white text-gray-300' },
                    { label: 'In Hands',  value: incareCount,  color: incareCount  > 0 ? 'bg-sky-50 text-sky-600'    : 'bg-white text-gray-300' },
                    { label: 'Ready',     value: readyCount,   color: readyCount   > 0 ? 'bg-green-50 text-green-600': 'bg-white text-gray-300' },
                    { label: 'Done',      value: doneCount,    color: doneCount    > 0 ? 'bg-white text-emerald-600' : 'bg-white text-gray-300' },
                  ].map(s => (
                    <div key={s.label} className={`flex flex-col items-center py-3 ${s.color}`}>
                      <span className="text-2xl font-black leading-none">{s.value}</span>
                      <span className="text-[9px] font-bold uppercase tracking-widest mt-1">{s.label}</span>
                    </div>
                  ))}
                </div>

                {loading && <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>}

                {!loading && (
                  <div className="p-3 space-y-3">
                    {appointments.length === 0 && !todaySearch && (
                      <div className="text-center py-16">
                        <div className="text-5xl mb-3">🌟</div>
                        <p className="text-gray-400 text-sm">No appointments scheduled for today</p>
                      </div>
                    )}
                    {groups.map(group => (
                      <div key={group.label} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                        <div className={`px-4 py-2.5 border-b flex items-center gap-2 ${group.headerCls}`}>
                          <span className="text-sm font-bold">{group.emoji} {group.label}</span>
                          <span className="text-xs font-medium opacity-60">{group.items.length} appt{group.items.length !== 1 ? 's' : ''}</span>
                          {group.label === 'Late' && lateCount > 0 && (
                            <span className="ml-auto text-[10px] font-bold text-red-500 bg-red-100 px-2 py-0.5 rounded-full">{lateCount} overdue</span>
                          )}
                        </div>
                        <div className="divide-y divide-gray-100">
                          {group.items.map(appt => <ApptRow key={appt.id} appt={appt} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── Pending Requests Tab — 3-section layout ── */}
          {tab === 'pending' && (
            <div className="max-w-2xl mx-auto px-4 pb-6 space-y-5">
              {loading && <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>}

              {!loading && (() => {
                const newClientAppts     = appointments.filter(a => a.status === 'pending' && (a as Appointment & {is_new_client?: boolean}).is_new_client)
                const confirmAppts       = appointments.filter(a => a.status === 'pending')
                const assignAppts        = appointments.filter(a => a.status === 'confirmed' && !a.assigned_groomer && !a.assigned_bather)
                const awaitingGroomerAppts = appointments.filter(a => a.status === 'confirmed' && (a.assigned_groomer || a.assigned_bather) && !a.groomer_confirmed)
                const totalAlert = confirmAppts.length + assignAppts.length + awaitingGroomerAppts.length

                return (
                  <>
                    {/* Summary bar */}
                    <div className="pt-4 pb-1 flex items-center justify-between">
                      <p className="text-sm text-gray-500">
                        {totalAlert > 0 ? `${totalAlert} item${totalAlert !== 1 ? 's' : ''} need your attention` : 'All caught up! 🎉'}
                      </p>
                      <button onClick={fetchAppointments} className="text-xs text-sky-500 font-semibold">↻ Refresh</button>
                    </div>

                    {/* ── Section 1: New Client ── */}
                    {newClientAppts.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold uppercase tracking-widest text-amber-500">⭐ New Client</span>
                          <span className="text-xs bg-amber-100 text-amber-600 font-bold px-2 py-0.5 rounded-full">{newClientAppts.length}</span>
                        </div>
                        <div className="space-y-3">
                          {newClientAppts.map(appt => (
                            <div key={appt.id} className="bg-white rounded-2xl border border-amber-200 overflow-hidden shadow-sm">
                              <div className="bg-amber-50 px-4 py-2 flex items-center gap-2 border-b border-amber-100">
                                <span className="text-xs font-bold text-amber-700">🆕 First Visit</span>
                                <span className="text-xs text-amber-500 ml-auto">{formatDate(appt.appointment_date)} · {appt.appointment_time}</span>
                                <button onClick={() => { setEditApptId(appt.id); setEditApptDraft({ service: appt.service, date: appt.appointment_date, time: appt.appointment_time, notes: (appt as any).notes ?? '' }) }} className="text-amber-400 hover:text-amber-600 text-sm ml-1">✏️</button>
                                <button onClick={() => { if (confirm('Delete this appointment permanently?')) deleteAppointment(appt.id) }} disabled={!!deletingApptId} className="text-gray-300 hover:text-rose-500 text-sm ml-0.5">🗑️</button>
                              </div>
                              <div className="px-4 py-3">
                                <div className="flex items-center gap-3 mb-3">
                                  {appt.pets?.photo_url
                                    ? <img src={appt.pets.photo_url} className="w-11 h-11 rounded-full object-cover flex-shrink-0" alt="" />
                                    : <div className="w-11 h-11 rounded-full bg-amber-100 flex items-center justify-center text-xl flex-shrink-0">🐶</div>}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <p className="font-bold text-gray-800">{appt.pets?.name} <span className="font-normal text-gray-400 text-sm">{appt.pets?.breed}</span></p>
                                      {appt.pets?.weight && <span className="text-[11px] font-black text-white bg-orange-400 px-2 py-0.5 rounded-full">⚖️ {appt.pets.weight}</span>}
                                    </div>
                                    <p className="text-sm text-gray-600">{appt.clients?.name}</p>
                                    <p className="text-xs text-gray-400">{appt.clients?.phone}</p>
                                  </div>
                                  <span className="text-xs px-2 py-1 rounded-lg bg-sky-100 text-sky-700 font-semibold flex-shrink-0 max-w-[110px] truncate">{serviceMap[appt.service] ?? appt.service}</span>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => handleAction(appt.id, 'confirm')} disabled={actionLoading !== null}
                                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl">
                                    ✓ Confirm
                                  </button>
                                  <button onClick={() => handleAction(appt.id, 'decline')} disabled={actionLoading !== null}
                                    className="flex-1 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-500 border border-red-200 text-sm font-bold py-2.5 rounded-xl">
                                    Decline
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Section 2: Appointment Confirmation ── */}
                    {confirmAppts.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold uppercase tracking-widest text-sky-500">📋 Appointment Confirmation</span>
                          <span className="text-xs bg-sky-100 text-sky-600 font-bold px-2 py-0.5 rounded-full">{confirmAppts.length}</span>
                        </div>
                        <div className="space-y-3">
                          {confirmAppts.map(appt => (
                            <div key={appt.id} className="bg-white rounded-2xl border border-sky-100 overflow-hidden shadow-sm">
                              <div className="bg-sky-50 px-4 py-2 flex items-center justify-between border-b border-sky-100">
                                <span className="text-xs font-semibold text-sky-700 flex-1 truncate mr-2">{serviceMap[appt.service] ?? appt.service}</span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="text-xs text-sky-500">{formatDate(appt.appointment_date)} · {appt.appointment_time}</span>
                                  <button onClick={() => { setEditApptId(appt.id); setEditApptDraft({ service: appt.service, date: appt.appointment_date, time: appt.appointment_time, notes: appt.notes ?? '' }) }} className="text-sky-400 hover:text-sky-600 text-sm">✏️</button>
                                  <button onClick={() => { if (confirm('Delete this appointment permanently?')) deleteAppointment(appt.id) }} disabled={!!deletingApptId} className="text-gray-300 hover:text-rose-500 text-sm">🗑️</button>
                                </div>
                              </div>
                              <div className="px-4 py-3">
                                <div className="flex items-center gap-3 mb-3">
                                  {appt.pets?.photo_url
                                    ? <img src={appt.pets.photo_url} className="w-10 h-10 rounded-full object-cover flex-shrink-0" alt="" />
                                    : <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg flex-shrink-0">🐶</div>}
                                  <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-800">{appt.pets?.name}
                                      <span className="font-normal text-gray-400 text-sm ml-1">{appt.pets?.breed}</span>
                                    </p>
                                    <p className="text-sm text-gray-600">{appt.clients?.name} · <span className="text-gray-400">{appt.clients?.phone}</span></p>
                                  </div>
                                  {appt.pets?.id && (
                                    quickVaxPetId === appt.pets.id ? (
                                      <div className="flex flex-col gap-1 flex-shrink-0">
                                        {(['verified','pending','email_sent'] as const).map(s => (
                                          <button key={s} disabled={savingVaccineId === appt.pets!.id}
                                            onClick={() => quickUpdateVax(appt.pets!.id, s)}
                                            className={`text-xs px-2 py-0.5 rounded-full font-medium border transition-all disabled:opacity-50 ${s==='verified' ? 'bg-green-500 text-white border-green-500' : s==='email_sent' ? 'bg-yellow-400 text-white border-yellow-400' : 'bg-red-400 text-white border-red-400'}`}>
                                            {s==='verified'?'✓ Vax':s==='email_sent'?'Pending':'No Vax'}
                                          </button>
                                        ))}
                                        <button onClick={() => setQuickVaxPetId(null)} className="text-xs text-gray-400 text-center">✕</button>
                                      </div>
                                    ) : (
                                      <button onClick={() => setQuickVaxPetId(appt.pets!.id)}
                                        className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${VACCINE_COLORS[appt.pets?.vaccine_status ?? ''] ?? 'bg-gray-100 text-gray-500'}`}>
                                        {appt.pets?.vaccine_status === 'verified' ? '✓ Vax' : '⚠️ No Vax'}
                                      </button>
                                    )
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => handleAction(appt.id, 'confirm')} disabled={actionLoading !== null}
                                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl">
                                    ✓ Confirm
                                  </button>
                                  <button onClick={() => handleAction(appt.id, 'decline')} disabled={actionLoading !== null}
                                    className="flex-1 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-500 border border-red-200 text-sm font-bold py-2.5 rounded-xl">
                                    Decline
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Section 3: Assign Staff ── */}
                    {assignAppts.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold uppercase tracking-widest text-violet-500">👥 Assign Staff</span>
                          <span className="text-xs bg-violet-100 text-violet-600 font-bold px-2 py-0.5 rounded-full">{assignAppts.length}</span>
                        </div>
                        <div className="space-y-3">
                          {assignAppts.map(appt => (
                            <div key={appt.id} className="bg-white rounded-2xl border border-violet-100 overflow-hidden shadow-sm">
                              <div className="bg-violet-50 px-4 py-2 flex items-center justify-between border-b border-violet-100">
                                <span className="text-xs font-semibold text-violet-700">{serviceMap[appt.service] ?? appt.service}</span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="text-xs text-violet-500">{formatDate(appt.appointment_date)} · {appt.appointment_time}</span>
                                  <button onClick={() => { setEditApptId(appt.id); setEditApptDraft({ service: appt.service, date: appt.appointment_date, time: appt.appointment_time, notes: (appt as any).notes ?? '' }) }} className="text-violet-400 hover:text-violet-600 text-sm">✏️</button>
                                  <button onClick={() => { if (confirm('Delete this appointment permanently?')) deleteAppointment(appt.id) }} disabled={!!deletingApptId} className="text-gray-300 hover:text-rose-500 text-sm">🗑️</button>
                                </div>
                              </div>
                              <div className="px-4 py-3">
                                <div className="flex items-center gap-3 mb-3">
                                  {appt.pets?.photo_url
                                    ? <img src={appt.pets.photo_url} className="w-10 h-10 rounded-full object-cover flex-shrink-0" alt="" />
                                    : <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg flex-shrink-0">🐶</div>}
                                  <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-800">{appt.pets?.name}
                                      <span className="font-normal text-gray-400 text-sm ml-1">{appt.pets?.breed}</span>
                                    </p>
                                    <p className="text-sm text-gray-600">{appt.clients?.name}</p>
                                  </div>
                                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">Confirmed</span>
                                </div>
                                {/* Staff pickers */}
                                <div className="grid grid-cols-2 gap-2 mb-2">
                                  <select defaultValue="" onChange={async e => {
                                    if (!e.target.value) return
                                    await fetch(`/api/admin/appointments/${appt.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action: 'assign-staff', assigned_groomer: e.target.value, assigned_bather: appt.assigned_bather || '' }) })
                                    fetchAppointments()
                                  }} className="border border-gray-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
                                    <option value="">✂️ Groomer…</option>
                                    {staff.filter(s => s.is_active && s.role !== 'admin').map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                  </select>
                                  <select defaultValue="" onChange={async e => {
                                    if (!e.target.value) return
                                    await fetch(`/api/admin/appointments/${appt.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action: 'assign-staff', assigned_groomer: appt.assigned_groomer || '', assigned_bather: e.target.value }) })
                                    fetchAppointments()
                                  }} className="border border-gray-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white">
                                    <option value="">🛁 Bather…</option>
                                    {staff.filter(s => s.is_active && s.role !== 'admin').map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                  </select>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Section 4: Awaiting Groomer Confirmation ── */}
                    {awaitingGroomerAppts.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-bold uppercase tracking-widest text-orange-500">⏳ Awaiting Groomer Confirm</span>
                          <span className="text-xs bg-orange-100 text-orange-600 font-bold px-2 py-0.5 rounded-full">{awaitingGroomerAppts.length}</span>
                        </div>
                        <div className="space-y-3">
                          {awaitingGroomerAppts.map(appt => (
                            <div key={appt.id} className="bg-white rounded-2xl border border-orange-100 overflow-hidden shadow-sm">
                              <div className="bg-orange-50 px-4 py-2 flex items-center justify-between border-b border-orange-100">
                                <span className="text-xs font-semibold text-orange-700">{serviceMap[appt.service] ?? appt.service}</span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-xs text-orange-500">{formatDate(appt.appointment_date)} · {appt.appointment_time}</span>
                                <button onClick={() => { setEditApptId(appt.id); setEditApptDraft({ service: appt.service, date: appt.appointment_date, time: appt.appointment_time, notes: (appt as any).notes ?? '' }) }} className="text-orange-400 hover:text-orange-600 text-sm">✏️</button>
                                <button onClick={() => { if (confirm('Delete this appointment permanently?')) deleteAppointment(appt.id) }} disabled={!!deletingApptId} className="text-gray-300 hover:text-rose-500 text-sm">🗑️</button>
                                </div>
                              </div>
                              <div className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  {appt.pets?.photo_url
                                    ? <img src={appt.pets.photo_url} className="w-10 h-10 rounded-full object-cover flex-shrink-0" alt="" />
                                    : <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg flex-shrink-0">🐶</div>}
                                  <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-800">{appt.pets?.name}
                                      <span className="font-normal text-gray-400 text-sm ml-1">{appt.pets?.breed}</span>
                                    </p>
                                    <p className="text-sm text-gray-600">{appt.clients?.name}</p>
                                  </div>
                                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">Pending confirm</span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {appt.assigned_groomer && <span className="text-xs bg-sky-50 text-sky-700 px-2 py-1 rounded-lg">✂️ {appt.assigned_groomer}</span>}
                                  {appt.assigned_bather  && <span className="text-xs bg-teal-50 text-teal-700 px-2 py-1 rounded-lg">🛁 {appt.assigned_bather}</span>}
                                </div>
                                {/* Allow re-assigning staff */}
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                  <select defaultValue="" onChange={async e => {
                                    if (!e.target.value) return
                                    await fetch(`/api/admin/appointments/${appt.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action: 'assign-staff', assigned_groomer: e.target.value, assigned_bather: appt.assigned_bather || '' }) })
                                    fetchAppointments()
                                  }} className="border border-gray-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white">
                                    <option value="">✂️ Change groomer…</option>
                                    {staff.filter(s => s.is_active && s.role !== 'admin').map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                  </select>
                                  <select defaultValue="" onChange={async e => {
                                    if (!e.target.value) return
                                    await fetch(`/api/admin/appointments/${appt.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action: 'assign-staff', assigned_groomer: appt.assigned_groomer || '', assigned_bather: e.target.value }) })
                                    fetchAppointments()
                                  }} className="border border-gray-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white">
                                    <option value="">🛁 Change bather…</option>
                                    {staff.filter(s => s.is_active && s.role !== 'admin').map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                  </select>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Empty state */}
                    {confirmAppts.length === 0 && assignAppts.length === 0 && newClientAppts.length === 0 && awaitingGroomerAppts.length === 0 && (
                      <div className="text-center py-16">
                        <div className="text-4xl mb-3">🎉</div>
                        <p className="text-gray-400 text-sm">No pending requests</p>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          )}

          {/* Appointments tabs wrapper */}
          {tab !== 'calendar' && tab !== 'settings' && tab !== 'customers' && tab !== 'checkout' && tab !== 'today' && tab !== 'pending' && (
            <div className="max-w-2xl mx-auto p-4 space-y-3">
              {loading && (
                <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
              )}

              {!loading && appointments.length === 0 && (
                <div className="text-center py-16">
                  <div className="text-4xl mb-3">🐾</div>
                  <p className="text-gray-400 text-sm">
                    {tab === 'pending' ? 'No pending requests' : 'No appointments found'}
                  </p>
                </div>
              )}

              {!loading && appointments.map((appt) => (
          <div key={appt.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            {/* Top row: name + date */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-gray-800 text-base">
                    {appt.pets?.name ?? '—'}
                  </span>
                  {appt.pets?.vaccine_status && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${VACCINE_COLORS[appt.pets.vaccine_status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {appt.pets.vaccine_status === 'verified' ? 'Vaccinated' :
                       appt.pets.vaccine_status === 'email_sent' ? 'Email Only' :
                       appt.pets.vaccine_status === 'pending' ? 'No Records' : 'Expired'}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500">{[appt.pets?.breed, appt.pets?.weight].filter(Boolean).join(' · ') || ''}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-sky-600">{formatDate(appt.appointment_date)}</p>
                <p className="text-sm text-gray-500">{formatTime(appt.appointment_time)}</p>
              </div>
            </div>

            {/* Service — inline editable */}
            <div className="flex items-center gap-2 mb-3">
              {editingServiceId === appt.id ? (
                <>
                  <select
                    value={editServiceVal}
                    onChange={e => setEditServiceVal(e.target.value)}
                    className="flex-1 border border-sky-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white"
                  >
                    {Object.entries(serviceMap).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => saveService(appt.id, editServiceVal)}
                    disabled={savingServiceId === appt.id}
                    className="px-3 py-1.5 bg-sky-500 text-white text-xs font-semibold rounded-xl disabled:opacity-50"
                  >{savingServiceId === appt.id ? '…' : '✓'}</button>
                  <button onClick={() => setEditingServiceId(null)} className="px-2 py-1.5 text-gray-400 text-xs rounded-xl hover:bg-gray-100">✕</button>
                </>
              ) : (
                <>
                  <span className="text-xs bg-sky-50 text-sky-700 px-2.5 py-1 rounded-full font-medium">
                    {serviceMap[appt.service] ?? appt.service}
                  </span>
                  <button
                    onClick={() => { setEditingServiceId(appt.id); setEditServiceVal(appt.service) }}
                    className="text-gray-400 hover:text-sky-500 text-xs leading-none"
                    title="Change service"
                  >✏️</button>
                </>
              )}
            </div>

            {/* Owner name */}
            <div className="bg-gray-50 rounded-xl px-3 py-2.5 mb-3">
              <p className="text-sm text-gray-700">
                <span className="text-gray-400">Owner:</span> {appt.clients?.name ?? '—'}
              </p>
            </div>

            {/* ── Pricing ─────────────────────────────────────────────── */}
            {editingPriceId === appt.id ? (() => {
              const svcDef = services.find(s => s.id === appt.service)
              const svcName = svcDef?.name ?? serviceMap[appt.service] ?? appt.service
              const tiers = (svcDef?.tiers ?? []).filter((t: {label:string;price:string}) => t.label)
              const otherServices = services.filter(s => s.id !== appt.service)
              const addOnTotal = popupAddOns.reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0)
              const baseAmt = parseFloat(popupBasePrice) || 0
              const subtotalAmt = baseAmt + addOnTotal
              const popupCoupon = availableCoupons.find(c => c.id === popupCouponId) ?? null
              const discountAmt = popupCoupon
                ? (popupCoupon.discount_type === 'percent' ? Math.round(subtotalAmt * popupCoupon.discount_value / 100 * 100) / 100 : Math.min(popupCoupon.discount_value, subtotalAmt))
                : 0
              const grandTotal = Math.round((subtotalAmt - discountAmt) * 100) / 100
              return (
                <div className="rounded-2xl p-4 border border-sky-200 bg-sky-50 mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">💰 Set Price</p>

                  {/* Size tiers */}
                  {tiers.length > 0 && (
                    <>
                      <p className="text-xs text-gray-400 mb-2">Tap a size to select ↓</p>
                      <div className="grid grid-cols-2 gap-1.5 mb-3">
                        {tiers.map((tier: {label:string;price:string}, i: number) => {
                          const explicitMatch = !!popupBaseTier && popupBaseTier === tier.label && !!tier.price
                          const uniquePriceMatch = !!tier.price && !popupBaseTier && popupBasePrice === tier.price
                            && tiers.filter((t: {price:string}) => t.price === tier.price).length === 1
                          const isSelected = explicitMatch || uniquePriceMatch
                          return (
                            <button key={i}
                              onClick={() => { if (tier.price) { setPopupBasePrice(isSelected ? '' : tier.price); setPopupBaseTier(isSelected ? '' : tier.label); setPopupTotalSaved(false) } }}
                              disabled={!tier.price}
                              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                                isSelected
                                  ? 'bg-sky-500 text-white border-sky-500 shadow-sm'
                                  : tier.price
                                    ? 'bg-white text-gray-700 border-gray-200 hover:border-sky-300'
                                    : 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                              }`}>
                              <div>{tier.label}</div>
                              {tier.price && <div className="font-bold mt-0.5">${tier.price}</div>}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}

                  {/* Custom price input */}
                  <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 mb-3 transition-all ${
                    popupBasePrice && !tiers.some((t: {price:string}) => t.price === popupBasePrice)
                      ? 'border-emerald-400 bg-emerald-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}>
                    <span className="text-xs font-medium text-gray-500 shrink-0">Custom $</span>
                    <input
                      type="text" inputMode="numeric" pattern="[0-9]*"
                      placeholder="or type a price…"
                      value={tiers.some((t: {price:string}) => t.price === popupBasePrice) ? '' : popupBasePrice}
                      onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setPopupBasePrice(v); setPopupBaseTier(''); setPopupTotalSaved(false) }}
                      onFocus={() => { if (popupBaseTier) { setPopupBasePrice(''); setPopupBaseTier(''); setPopupTotalSaved(false) } }}
                      className="flex-1 text-sm font-bold text-gray-800 bg-transparent focus:outline-none"
                    />
                  </div>

                  {/* Add-on Services */}
                  {(otherServices.length > 0 || popupAddOns.length > 0) && (
                    <div className="border-t border-gray-100 pt-3 mt-1 mb-3">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Add-on Services</p>
                      {popupAddOns.length > 0 && (
                        <div className="space-y-1.5 mb-2">
                          {popupAddOns.map(addon => (
                            <div key={addon.id} className="flex items-center gap-2 bg-white border border-sky-200 rounded-xl px-3 py-2">
                              <span className="text-xs font-semibold text-sky-800 flex-1">{addon.name}</span>
                              <span className="text-xs text-sky-500">+</span>
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-500">$</span>
                                <input
                                  type="text" inputMode="numeric" pattern="[0-9]*"
                                  value={addon.price}
                                  onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setPopupAddOns(prev => prev.map(a => a.id === addon.id ? { ...a, price: v } : a)); setPopupTotalSaved(false) }}
                                  className="w-14 text-sm font-bold text-sky-700 bg-transparent focus:outline-none text-right"
                                />
                              </div>
                              <button onClick={() => { setPopupAddOns(prev => prev.filter(a => a.id !== addon.id)); setPopupTotalSaved(false) }}
                                className="text-gray-300 hover:text-rose-400 text-base font-bold ml-1 transition-colors">✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {otherServices
                          .filter((s: {id:string}) => !popupAddOns.find(a => a.id === s.id))
                          .map((s: {id:string;name:string;tiers?:{label:string;price:string}[]}) => (
                            <button key={s.id}
                              onClick={() => {
                                const defaultPrice = s.tiers?.find(t => t.price)?.price ?? ''
                                setPopupAddOns(prev => [...prev, { id: s.id, name: s.name ?? serviceMap[s.id] ?? s.id, price: defaultPrice }])
                                setPopupTotalSaved(false)
                              }}
                              className="text-xs bg-gray-100 hover:bg-sky-100 text-gray-600 hover:text-sky-700 px-2.5 py-1.5 rounded-lg font-medium transition-colors">
                              + {s.name ?? serviceMap[s.id] ?? s.id}
                            </button>
                          ))
                        }
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          value={popupAddonDraft.text}
                          onChange={e => setPopupAddonDraft(prev => ({ ...prev, text: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && popupAddonDraft.text.trim()) {
                              setPopupAddOns(prev => [...prev, { id: Date.now().toString(), name: popupAddonDraft.text.trim(), price: popupAddonDraft.price }])
                              setPopupAddonDraft({ text: '', price: '' })
                              setPopupTotalSaved(false)
                            }
                          }}
                          placeholder="Custom add-on…"
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                        />
                        <input
                          value={popupAddonDraft.price}
                          onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setPopupAddonDraft(prev => ({ ...prev, price: v })) }}
                          placeholder="$" type="text" inputMode="numeric"
                          className="w-12 border border-gray-200 rounded-xl px-2 py-1.5 text-xs text-center bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                        />
                        <button
                          onClick={() => {
                            if (!popupAddonDraft.text.trim()) return
                            setPopupAddOns(prev => [...prev, { id: Date.now().toString(), name: popupAddonDraft.text.trim(), price: popupAddonDraft.price }])
                            setPopupAddonDraft({ text: '', price: '' })
                            setPopupTotalSaved(false)
                          }}
                          disabled={!popupAddonDraft.text.trim()}
                          className="px-2.5 py-1.5 bg-sky-500 text-white text-xs font-bold rounded-xl disabled:opacity-40">+</button>
                      </div>
                    </div>
                  )}

                  {/* Discount code selector (shared; first-visit-only gated) */}
                  {subtotalAmt > 0 && (
                    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 border-2 mb-2 ${popupCouponId ? 'bg-pink-50 border-pink-300' : 'bg-gray-50 border-gray-200'}`}>
                      <span className="text-xs">🎟️</span>
                      <select value={popupCouponId ?? ''} onChange={e => { setPopupCouponId(e.target.value || null); setPopupTotalSaved(false) }}
                        className={`flex-1 text-xs font-semibold bg-transparent focus:outline-none ${popupCouponId ? 'text-pink-700' : 'text-gray-400'}`}>
                        <option value="">Apply discount…</option>
                        {availableCoupons.map(c => {
                          const blocked = c.first_visit_only && !mobileIsFirstTime
                          return <option key={c.id} value={c.id} disabled={blocked}>{c.name} — {c.discount_type === 'percent' ? `${c.discount_value}% off` : `$${c.discount_value} off`}{blocked ? ' · first visit only' : ''}</option>
                        })}
                      </select>
                      {popupCouponId && <button onClick={() => { setPopupCouponId(null); setPopupTotalSaved(false) }} className="text-pink-400 text-base leading-none">✕</button>}
                    </div>
                  )}

                  {/* Total breakdown */}
                  {(popupBasePrice || popupAddOns.length > 0) && (
                    <div className="bg-white rounded-xl px-3 py-2 mb-3 space-y-1 border border-gray-100">
                      {popupBasePrice && (
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>{svcName}</span>
                          <span className="font-semibold">${popupBasePrice}</span>
                        </div>
                      )}
                      {popupAddOns.map(a => (
                        <div key={a.id} className="flex justify-between text-xs text-gray-500">
                          <span>{a.name}</span>
                          <span className="font-semibold">${a.price || '0'}</span>
                        </div>
                      ))}
                      {discountAmt > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-pink-500 font-semibold">🎉 20% off</span>
                          <span className="font-bold text-pink-500">−${discountAmt.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-bold text-gray-800 pt-1 border-t border-gray-200">
                        <span>Total</span>
                        <span className={popupTotalSaved && grandTotal > 0 ? 'text-emerald-600' : discountAmt > 0 ? 'text-pink-600' : 'text-gray-800'}>${grandTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  {/* Save Total + Close */}
                  <div className="flex gap-2">
                    <button
                      disabled={grandTotal <= 0 || savingPopupPayment}
                      onClick={async () => {
                        if (grandTotal <= 0) return
                        const amount = grandTotal.toString()
                        setSavingPopupPayment(true)
                        try {
                          const res = await fetch(`/api/admin/appointments/${appt.id}`, {
                            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'record-payment', payment_amount: amount, size_tier: popupBaseTier || null,
                              addons: popupAddOns,
                              discount_label: popupCoupon ? popupCoupon.name : null,
                              discount_percent: popupCoupon?.discount_type === 'percent' ? String(popupCoupon.discount_value) : null,
                              discount_amount: discountAmt > 0 ? discountAmt.toFixed(2) : null }),
                          })
                          if ((await res.json()).success) {
                            setPopupTotalSaved(true)
                            const addonNotes = popupAddOns.map(a => ({ id: a.id, text: a.name, price: a.price, is_addon: true as const, author: 'system', created_at: new Date().toISOString() }))
                            const nonAddonNotes = (appt.notes_list ?? []).filter(n => !n.is_addon)
                            setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, payment_amount: amount, size_tier: popupBaseTier || null,
                              discount_label: popupCoupon ? popupCoupon.name : null,
                              discount_percent: popupCoupon?.discount_type === 'percent' ? String(popupCoupon.discount_value) : null,
                              discount_amount: discountAmt > 0 ? discountAmt.toFixed(2) : null,
                              notes_list: [...nonAddonNotes, ...addonNotes] } : a))
                            showToast('✓ Total saved!')
                          }
                        } catch {/**/}
                        finally { setSavingPopupPayment(false) }
                      }}
                      className={`flex-1 py-2.5 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors ${
                        grandTotal <= 0 ? 'bg-gray-300' : popupTotalSaved ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-sky-500 hover:bg-sky-600'
                      }`}>
                      {savingPopupPayment ? '⏳ Saving…' : grandTotal > 0 ? (popupTotalSaved ? `✓ Saved · $${grandTotal}` : `💾 Save Total · $${grandTotal}`) : 'Select a size first'}
                    </button>
                    <button
                      onClick={() => { setEditingPriceId(null); setPopupBasePrice(''); setPopupBaseTier(''); setPopupAddOns([]); setPopupCouponId(null); setPopupTotalSaved(false) }}
                      className="px-3 py-2.5 bg-white text-gray-500 text-sm rounded-xl border border-gray-200 hover:bg-gray-50">✕</button>
                  </div>
                </div>
              )
            })() : (
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5 mb-3">
                <span className="text-sm font-semibold text-gray-700">💰 Total Price</span>
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${appt.payment_amount ? 'text-emerald-600 text-base' : 'text-gray-400 text-sm'}`}>
                    {appt.payment_amount ? `$${appt.payment_amount}` : '—'}
                  </span>
                  <button
                    onClick={() => { const sd = parseFloat((appt as { discount_amount?: string | null }).discount_amount || '') || 0; const dl = (appt as { discount_label?: string | null }).discount_label || ''; const dp = parseFloat((appt as { discount_percent?: string | null }).discount_percent || ''); const m = availableCoupons.find(c => c.name === dl) ?? availableCoupons.find(c => !isNaN(dp) && c.discount_type === 'percent' && c.discount_value === dp); const savedAddOns = (appt.notes_list ?? []).filter(n => n.is_addon).map(n => ({ id: n.id, name: n.text, price: n.price ?? '' })); const addonTotal = savedAddOns.reduce((s, a) => s + (parseFloat(a.price) || 0), 0); setEditingPriceId(appt.id); setPopupBasePrice(appt.payment_amount != null ? String(Math.max(0, parseFloat(String(appt.payment_amount)) + sd - addonTotal)) : ''); setPopupBaseTier((appt as { size_tier?: string | null }).size_tier || ''); setPopupAddOns(savedAddOns); setPopupAddonDraft({ text: '', price: '' }); setPopupCouponId(sd > 0 ? (m?.id ?? null) : null); setMobileIsFirstTime(false); if (appt.pets?.id) fetch(`/api/groomer/last-payment?pet_id=${appt.pets.id}&exclude_id=${appt.id}`).then(r => r.json()).then(d => setMobileIsFirstTime(!d?.amount)).catch(() => {}); setPopupTotalSaved(false) }}
                    className="text-gray-400 hover:text-sky-500 text-xs leading-none"
                    title="Set price"
                  >✏️</button>
                </div>
              </div>
            )}

            {/* Notes Section — only for confirmed/completed, not pending */}
            {tab !== 'pending' && <div className="mt-3 border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">📝 Staff Notes</p>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  {translatingId === appt.id && <span className="inline-block w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />}
                  {translatingId === appt.id ? 'Translating…' : noteTranslationsMap[appt.id] ? '✓ Auto-translated' : 'Type in any language'}
                </span>
              </div>
              <div className="space-y-2">
                {/* Single free-text input */}
                <textarea
                  value={noteDrafts[appt.id]?.chinese ?? (appt.notes_chinese || appt.notes_english || '')}
                  onChange={e => {
                    const val = e.target.value
                    setNoteDrafts(prev => ({ ...prev, [appt.id]: { ...prev[appt.id] || {chinese:'',english:''}, chinese: val } }))
                    triggerAutoTranslateMobile(appt.id, val)
                  }}
                  placeholder="Type in English, 繁體中文, or 简体中文…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none bg-white"
                  rows={2}
                />

                {/* 3-way translation results */}
                {noteTranslationsMap[appt.id] && (() => {
                  const t = noteTranslationsMap[appt.id]
                  return (
                    <div className="bg-violet-50 rounded-xl p-3 space-y-2 border border-violet-100">
                      <p className="text-xs font-semibold text-violet-500 flex items-center gap-1">✨ AI Translation</p>
                      {t.detected !== 'english' && t.english && (
                        <div className="bg-white rounded-lg px-3 py-2 border border-violet-100">
                          <p className="text-xs font-semibold text-gray-400 mb-0.5">🇺🇸 English</p>
                          <p className="text-sm text-gray-700">{t.english}</p>
                        </div>
                      )}
                      {t.detected !== 'traditional' && t.traditional && (
                        <div className="bg-white rounded-lg px-3 py-2 border border-violet-100">
                          <p className="text-xs font-semibold text-gray-400 mb-0.5">🇹🇼 繁體中文</p>
                          <p className="text-sm text-gray-700">{t.traditional}</p>
                        </div>
                      )}
                      {t.simplified && t.detected !== 'simplified' && (
                        <div className="bg-white rounded-lg px-3 py-2 border border-violet-100">
                          <p className="text-xs font-semibold text-gray-400 mb-0.5">🇨🇳 简体中文</p>
                          <p className="text-sm text-gray-700">{t.simplified}</p>
                        </div>
                      )}
                    </div>
                  )
                })()}

                <button
                  onClick={() => saveNotes(appt.id)}
                  className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 rounded-xl text-sm transition-colors"
                >
                  💾 Save Notes
                </button>
              </div>
            </div>}

            {/* Action buttons — only for pending */}
            {appt.status === 'pending' && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleAction(appt.id, 'confirm')}
                  disabled={actionLoading !== null}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
                >
                  {actionLoading === appt.id + 'confirm' ? 'Confirming...' : 'Confirm & SMS Client'}
                </button>
                <button
                  onClick={() => handleAction(appt.id, 'decline')}
                  disabled={actionLoading !== null}
                  className="flex-1 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 font-semibold py-2.5 rounded-xl text-sm transition-colors border border-red-200"
                >
                  {actionLoading === appt.id + 'decline' ? 'Declining...' : 'Decline'}
                </button>
              </div>
            )}

            {/* Status badge + reminder button for confirmed */}
            {appt.status !== 'pending' && (
              <div className="space-y-2">
                <div className={`text-center text-xs font-medium py-1.5 rounded-xl ${
                  appt.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' :
                  appt.status === 'cancelled' ? 'bg-red-50 text-red-600' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
                  {appt.confirmed_at && appt.status === 'confirmed' && ` • ${new Date(appt.confirmed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                </div>
                {appt.status === 'confirmed' && (
                  <button
                    onClick={async () => {
                      setActionLoading(appt.id + 'reminder')
                      try {
                        const res = await fetch('/api/admin/send-reminder', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ appointmentId: appt.id }),
                        })
                        const data = await res.json()
                        showToast(data.success ? `✓ Reminder sent to ${appt.clients?.name}` : `SMS failed: ${data.error}`)
                      } catch { showToast('Failed to send reminder') }
                      setActionLoading(null)
                    }}
                    disabled={actionLoading !== null}
                    className="w-full bg-sky-50 hover:bg-sky-100 disabled:opacity-50 text-sky-600 font-semibold py-2 rounded-xl text-sm transition-colors border border-sky-200"
                  >
                    {actionLoading === appt.id + 'reminder' ? 'Sending...' : '📱 Send Reminder Text'}
                  </button>
                )}
              </div>
            )}

            {/* ── Reschedule ── */}
            {reschedulingId === appt.id ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-semibold text-amber-700">📅 Pick New Date & Time</p>
                <input type="date"
                  value={rescheduleData[appt.id]?.date ?? appt.appointment_date}
                  onChange={e => setRescheduleData(prev => ({ ...prev, [appt.id]: { ...prev[appt.id], date: e.target.value, time: prev[appt.id]?.time ?? appt.appointment_time } }))}
                  className="w-full border border-amber-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white" />
                <select
                  value={rescheduleData[appt.id]?.time ?? appt.appointment_time}
                  onChange={e => setRescheduleData(prev => ({ ...prev, [appt.id]: { ...prev[appt.id], time: e.target.value, date: prev[appt.id]?.date ?? appt.appointment_date } }))}
                  className="w-full border border-amber-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white">
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="flex gap-2">
                  <button onClick={() => rescheduleAppointment(appt.id)} disabled={!!savingRescheduleId}
                    className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm">
                    {savingRescheduleId === appt.id ? 'Saving…' : '✓ Confirm Reschedule'}
                  </button>
                  <button onClick={() => setReschedulingId(null)}
                    className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => {
                setReschedulingId(appt.id)
                setRescheduleData(prev => ({ ...prev, [appt.id]: { date: appt.appointment_date, time: appt.appointment_time } }))
              }} className="w-full border-2 border-dashed border-amber-300 hover:border-amber-400 text-amber-600 hover:text-amber-700 font-semibold py-2.5 rounded-xl text-sm transition-colors">
                📅 Reschedule
              </button>
            )}

            {/* Delete button */}
            <div className="pt-1">
              <button
                onClick={() => { if (confirm('Delete this appointment permanently? This cannot be undone.')) deleteAppointment(appt.id) }}
                disabled={!!deletingApptId}
                className="w-full bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 font-semibold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
              >
                {deletingApptId === appt.id ? '⏳ Deleting…' : '🗑 Delete Appointment'}
              </button>
            </div>
              </div>
            ))}
            </div>
          )}

          {/* ── Calendar Tab ── */}
          {tab === 'calendar' && !loading && (() => {
        const [year, month] = calendarMonth.split('-').map(Number)
        const firstDay = new Date(year, month - 1, 1).getDay()
        const daysInMonth = new Date(year, month, 0).getDate()
        const today = new Date().toISOString().split('T')[0]
        const monthName = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

        const byDate: Record<string, Appointment[]> = {}
        calendarAppts.forEach(a => {
          if (!byDate[a.appointment_date]) byDate[a.appointment_date] = []
          byDate[a.appointment_date].push(a)
        })

        const prevMonth = () => {
          const d = new Date(year, month - 2)
          setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
          setSelectedDay(null)
        }
        const nextMonth = () => {
          const d = new Date(year, month)
          setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
          setSelectedDay(null)
        }

        // Total cells needed (pad to complete last row)
        const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7

        return (
          <div className="pb-4">
            {/* Month nav — clean white */}
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
              <button onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-sky-600 hover:bg-sky-50 text-2xl font-light transition-colors">‹</button>
              <h2 className="font-bold text-gray-800 text-base tracking-wide">{monthName}</h2>
              <button onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-sky-600 hover:bg-sky-50 text-2xl font-light transition-colors">›</button>
            </div>

            {/* Calendar grid */}
            <div className="border-x border-b border-gray-200 overflow-hidden">
              {/* Day headers */}
              <div className="grid grid-cols-7 bg-sky-50">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-sky-600 py-2 border-r border-sky-100 last:border-r-0">{d}</div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7">
                {Array.from({ length: totalCells }).map((_, i) => {
                  const dayNum = i - firstDay + 1
                  const isValid = dayNum >= 1 && dayNum <= daysInMonth
                  if (!isValid) return (
                    <div key={`e-${i}`} className={`min-h-[80px] bg-gray-100 border-r border-b border-gray-200 ${i % 7 === 6 ? 'border-r-0' : ''}`} />
                  )

                  const dateStr = `${calendarMonth}-${String(dayNum).padStart(2, '0')}`
                  const dayAppts = byDate[dateStr] || []
                  const isBlocked = blockedDatesList.some(b => b.date === dateStr)
                  const isToday = dateStr === today
                  const isSelected = dateStr === selectedDay
                  const col = i % 7

                  // Count by service
                  const svcCounts: Record<string,number> = {}
                  dayAppts.forEach(a => { svcCounts[a.service] = (svcCounts[a.service] || 0) + 1 })
                  const total = dayAppts.length

                  return (
                    <div
                      key={dayNum}
                      onClick={() => !isBlocked && setSelectedDay(isSelected ? null : dateStr)}
                      className={`min-h-[80px] border-r border-b border-gray-200 cursor-pointer transition-colors flex flex-col
                        ${col === 6 ? 'border-r-0' : ''}
                        ${isBlocked ? 'bg-gray-100 opacity-60' : 'bg-white'}
                        ${!isBlocked && isSelected ? 'bg-sky-50 ring-2 ring-inset ring-sky-400' : ''}
                        ${!isBlocked && isToday && !isSelected ? 'bg-sky-50/60' : ''}
                      `}
                    >
                      {/* Date number */}
                      <div className="px-1.5 pt-1.5 pb-0.5">
                        <span className={`text-xs font-bold inline-flex items-center justify-center w-6 h-6 rounded-full
                          ${isToday ? 'bg-sky-500 text-white' : isSelected ? 'bg-sky-200 text-sky-800' : 'text-gray-700'}
                        `}>{dayNum}</span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 px-1 pb-1">
                        {isBlocked ? (
                          <div className="text-[10px] font-bold text-gray-400 text-center mt-1">BLOCKED</div>
                        ) : total === 0 ? (
                          <div className="flex items-center justify-center h-full">
                            <span className="text-2xl font-bold text-gray-300">0</span>
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            {Object.entries(svcCounts).map(([svc, cnt]) => {
                              const fullName = serviceMap[svc]
                              const shortName = serviceShortMap[svc] ?? (fullName ? fullName.slice(0, 4) : '?')
                              return (
                                <div key={svc} className="flex items-center gap-0.5" title={fullName ?? svc}>
                                  <span className="text-[11px] font-bold text-gray-700">{cnt}:</span>
                                  <span className="text-[11px] font-semibold text-violet-600">{shortName}</span>
                                </div>
                              )
                            })}
                            <div className="border-t border-gray-100 mt-0.5 pt-0.5">
                              <span className="text-[10px] font-bold text-sky-600">{total}: total</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Legend — dynamic, includes all loaded services */}
            <div className="flex gap-3 mt-3 px-1 text-xs text-gray-500 flex-wrap">
              {Object.entries(serviceShortMap).map(([id, short]) => (
                <span key={id}><span className="font-bold text-[#7b3f8a]">{short}</span> = {serviceMap[id] ?? id}</span>
              ))}
            </div>

            {/* ── Add Appointment Modal ── */}
            {addingApptSlot && (
              <div className="fixed inset-0 z-[80] flex items-end justify-center">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={clearAddApptForm} />
                <div className="relative bg-white rounded-t-2xl w-full max-w-lg shadow-2xl flex flex-col" style={{maxHeight:'90vh'}}>
                  {/* Header */}
                  <div className="bg-sky-50 border-b border-sky-100 px-5 py-4 flex items-center justify-between shrink-0 rounded-t-2xl">
                    <div>
                      <h3 className="font-bold text-sky-800 text-base">New Appointment</h3>
                      <p className="text-sm text-sky-600 mt-0.5">
                        {new Date(addingApptSlot.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                        {' · '}{addingApptSlot.time}
                      </p>
                    </div>
                    <button onClick={clearAddApptForm}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-sky-100 text-sky-500 text-xl font-light">×</button>
                  </div>

                  {/* Body */}
                  <div className="px-5 py-5 space-y-4 overflow-y-auto flex-1">
                    {/* Phone */}
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Client Phone</label>
                      <div className="flex items-center gap-2">
                        <input type="tel" value={addApptPhone}
                          onChange={e => {
                            const val = e.target.value
                            setAddApptPhone(val)
                            if (val.replace(/\D/g, '').length >= 10) lookupClientByPhone(val)
                          }}
                          onBlur={() => { if (addApptPhone.replace(/\D/g,'').length >= 7) lookupClientByPhone(addApptPhone) }}
                          placeholder="(555) 000-0000" autoFocus
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                        {addApptPhoneLooking && <span className="text-xs text-gray-400">Looking up…</span>}
                      </div>
                      {addApptClientData ? (
                        <p className="text-sm font-semibold text-emerald-600 mt-1.5">✓ Existing client: {addApptClientData.name}</p>
                      ) : addApptPhone.length >= 7 && !addApptPhoneLooking ? (
                        <div className="mt-2 p-3 bg-amber-50 border border-amber-100 rounded-xl space-y-2">
                          <p className="text-xs font-semibold text-amber-700">🆕 New client — fill in details:</p>
                          <div className="grid grid-cols-2 gap-2">
                            <input type="text" value={addApptFirstName} onChange={e => setAddApptFirstName(e.target.value)}
                              placeholder="First name *"
                              className="border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                            <input type="text" value={addApptLastName} onChange={e => setAddApptLastName(e.target.value)}
                              placeholder="Last name"
                              className="border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                          </div>
                          <input type="email" value={addApptEmail} onChange={e => setAddApptEmail(e.target.value)}
                            placeholder="Email (optional)"
                            className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                        </div>
                      ) : null}
                    </div>

                    {/* Pet */}
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Pet</label>
                      {addApptClientData && addApptClientData.pets.length > 0 ? (
                        <>
                          <select value={addApptPetId}
                            onChange={e => {
                              const pet = addApptClientData.pets.find(p => p.id === e.target.value)
                              setAddApptPetId(e.target.value)
                              setAddApptPetName(pet?.name || '')
                            }}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300">
                            <option value="">Select a pet…</option>
                            {addApptClientData.pets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          {!addApptPetId && (
                            <div className="mt-2 p-3 bg-gray-50 border border-gray-100 rounded-xl space-y-2">
                              <p className="text-xs text-gray-500 font-medium">Or add a new pet:</p>
                              <input type="text" value={addApptPetName} onChange={e => setAddApptPetName(e.target.value)}
                                placeholder="Pet name"
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                              {addApptPetName && (
                                <div className="grid grid-cols-2 gap-2">
                                  <BreedInput value={addApptBreed} onChange={setAddApptBreed}
                                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 w-full" />
                                  <select value={addApptWeight} onChange={e => setAddApptWeight(e.target.value)}
                                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white">
                                    <option value="">Size / Weight</option>
                                    {WEIGHT_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
                                  </select>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="space-y-2">
                          <input type="text" value={addApptPetName} onChange={e => setAddApptPetName(e.target.value)}
                            placeholder="Pet name *"
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                          {addApptPetName && (
                            <div className="grid grid-cols-2 gap-2">
                              <BreedInput value={addApptBreed} onChange={setAddApptBreed}
                                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 w-full" />
                              <select value={addApptWeight} onChange={e => setAddApptWeight(e.target.value)}
                                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white">
                                <option value="">Size / Weight</option>
                                {WEIGHT_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Vaccine — only for new pets */}
                    {!addApptPetId && (
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">💉 Vaccine Records</label>
                        <select value={addApptVaccine} onChange={e => setAddApptVaccine(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300">
                          <option value="pending">⚠️ Not yet — request at appointment</option>
                          <option value="text">📱 Will send via text</option>
                          <option value="email">📧 Will send via email</option>
                          <option value="verified">✓ Already have on file</option>
                        </select>
                      </div>
                    )}

                    {/* Service */}
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Service</label>
                      <select value={addApptService} onChange={e => setAddApptService(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300">
                        {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="px-5 pb-6 pt-3 border-t border-gray-100 flex gap-3 shrink-0">
                    <button onClick={submitQuickAddAppt}
                      disabled={addApptSaving || !addApptPhone || (!addApptPetId && !addApptPetName)}
                      className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
                      {addApptSaving ? 'Adding…' : 'Add Appointment'}
                    </button>
                    <button onClick={clearAddApptForm}
                      className="px-5 py-3 rounded-xl border border-gray-200 text-sm text-gray-600 font-medium">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}


            {/* Day detail MODAL — bottom sheet */}
            {selectedDay && (
              <div className="fixed inset-0 z-50 flex flex-col justify-end">
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/50"
                  onClick={() => { setSelectedDay(null); setBlockingSlot(null); setBlockReason(''); setCalendarStaffFilter('all') }} />

                {/* Bottom sheet */}
                <div className="relative bg-white rounded-t-2xl flex flex-col" style={{maxHeight:'85vh'}}>
                  {/* Drag handle */}
                  <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                    <div className="w-10 h-1 bg-gray-300 rounded-full" />
                  </div>

                  {/* Header */}
                  <div className="px-4 pb-3 pt-1 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                    <div>
                      <h3 className="font-bold text-gray-800 text-base">
                        {new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {(byDate[selectedDay]?.length || 0)} appointment{(byDate[selectedDay]?.length || 0) !== 1 ? 's' : ''}
                        {blockedTimes.filter(b => b.date === selectedDay).length > 0 &&
                          <span className="ml-2 text-rose-400">· {blockedTimes.filter(b => b.date === selectedDay).length} blocked</span>}
                      </p>
                    </div>
                    <button onClick={() => { setSelectedDay(null); setBlockingSlot(null); setBlockReason(''); setCalendarStaffFilter('all') }}
                      className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-lg font-bold">✕</button>
                  </div>

                  {/* Staff filter chips */}
                  {staff.filter(s => s.is_active && s.role !== 'admin').length > 0 && (
                    <div className="px-4 py-2.5 flex items-center gap-2 overflow-x-auto flex-shrink-0 border-b border-gray-100">
                      <button
                        onClick={() => setCalendarStaffFilter('all')}
                        className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                          calendarStaffFilter === 'all'
                            ? 'bg-sky-500 text-white'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                        All
                      </button>
                      {staff.filter(s => s.is_active && s.role !== 'admin').map(s => (
                        <button
                          key={s.id}
                          onClick={() => setCalendarStaffFilter(calendarStaffFilter === s.name ? 'all' : s.name)}
                          className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap ${
                            calendarStaffFilter === s.name
                              ? s.role === 'groomer' ? 'bg-sky-500 text-white' : 'bg-teal-500 text-white'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                          {s.role === 'groomer' ? '✂️' : '🛁'} {s.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Time slot timeline */}
                  <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
                    {TIME_OPTIONS.filter(slot => {
                      const openIdx = TIME_OPTIONS.indexOf(openTime)
                      const closeIdx = TIME_OPTIONS.indexOf(closeTime)
                      const slotIdx = TIME_OPTIONS.indexOf(slot)
                      if (openIdx === -1 || closeIdx === -1) return true
                      return slotIdx >= openIdx && slotIdx <= closeIdx
                    }).map(slot => {
                      const appts = (byDate[selectedDay] || []).filter(a => a.appointment_time === slot)
                      const blocked = blockedTimes.find(b => b.date === selectedDay && b.time === slot)
                      const isBlocking = blockingSlot?.date === selectedDay && blockingSlot?.time === slot
                      const visibleAppts = calendarStaffFilter === 'all'
                        ? appts
                        : appts.filter(a => a.assigned_groomer === calendarStaffFilter || a.assigned_bather === calendarStaffFilter)

                      return (
                        <div key={slot} className={`flex items-stretch min-h-[58px] ${
                          appts.length === 0 && blocked ? 'bg-rose-50/60' : ''
                        }`}>
                          {/* Time label */}
                          <div className="w-16 flex-shrink-0 flex items-start justify-end pr-3 pt-4">
                            <span className="text-xs font-semibold text-gray-400 whitespace-nowrap">{slot}</span>
                          </div>

                          {/* Slot content */}
                          <div className="flex-1 border-l border-gray-100 py-2 px-3 flex flex-col gap-2">
                            {visibleAppts.length > 0 ? (
                              visibleAppts.map(appt => (
                              <button key={appt.id} onClick={() => {
                                const savedAddOns = (appt.notes_list ?? []).filter((n: {is_addon?:boolean}) => n.is_addon).map((n: {id:string;text:string;price?:string}) => ({ id: n.id, name: n.text, price: n.price ?? '' }))
                                const addonTotal = savedAddOns.reduce((s: number, x: {price:string}) => s + (parseFloat(x.price) || 0), 0)
                                const sd = parseFloat((appt as { discount_amount?: string | null }).discount_amount || '') || 0
                                setCalendarAddOns(savedAddOns)
                                setCalendarAddonDraft({ text: '', price: '' })
                                setCalendarBasePrice(appt.payment_amount != null ? String(Math.max(0, parseFloat(String(appt.payment_amount)) + sd - addonTotal)) : '')
                                setCalendarBaseTier((appt as { size_tier?: string | null }).size_tier || '')
                                setCalendarTotalSaved(!!appt.payment_amount)
                                setCalendarDetailAppt(appt); setDetailSheetTab('appt')
                              }}
                                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left active:scale-98 ${
                                  appt.service === 'simply_cute' ? 'bg-sky-50 border border-sky-200' :
                                  appt.service === 'bath_brush'  ? 'bg-teal-50 border border-teal-200' :
                                  appt.service === 'asian_fusion'? 'bg-pink-50 border border-pink-200' :
                                  'bg-gray-50 border border-gray-200'}`}>
                                {appt.pets?.photo_url
                                  ? <img src={appt.pets.photo_url} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt="" />
                                  : <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-base flex-shrink-0">🐶</div>}
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-gray-800 text-sm truncate">{appt.pets?.name}
                                    <span className="font-normal text-gray-400 text-xs ml-1">{[appt.pets?.breed, appt.pets?.weight].filter(Boolean).join(' · ')}</span>
                                  </p>
                                  <p className="text-xs text-gray-500 truncate">{serviceMap[appt.service] ?? appt.service} · {appt.clients?.name}</p>
                                  {(appt.assigned_groomer || appt.assigned_bather) && (
                                    <p className="text-xs text-gray-400">
                                      {appt.assigned_groomer && <span>✂️ {appt.assigned_groomer}</span>}
                                      {appt.assigned_groomer && appt.assigned_bather && <span className="mx-1">·</span>}
                                      {appt.assigned_bather && <span>🛁 {appt.assigned_bather}</span>}
                                    </p>
                                  )}
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                                  appt.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                  appt.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
                                  appt.status === 'completed' ? 'bg-gray-100 text-gray-500' :
                                  'bg-red-100 text-red-500'}`}>{appt.status}</span>
                              </button>
                              ))
                            ) : blocked ? (
                              <div className="flex-1 flex items-center gap-2">
                                <div className="flex-1">
                                  <span className="text-xs font-semibold text-rose-400">🚫 Blocked</span>
                                  {blocked.reason && <span className="text-xs text-rose-300 ml-1">— {blocked.reason}</span>}
                                </div>
                                <button onClick={() => unblockTimeSlot(selectedDay, slot)}
                                  className="text-xs text-rose-400 border border-rose-200 px-2 py-1 rounded-lg">
                                  ✕ Unblock
                                </button>
                              </div>
                            ) : isBlocking ? (
                              <div className="flex-1 flex items-center gap-2">
                                <input type="text" value={blockReason} onChange={e => setBlockReason(e.target.value)}
                                  placeholder="Reason (optional)"
                                  className="flex-1 text-xs border border-rose-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                                  autoFocus />
                                <button onClick={() => blockTimeSlot(selectedDay, slot, blockReason)} disabled={savingBlock}
                                  className="text-xs bg-rose-500 text-white px-2 py-1.5 rounded-lg font-medium disabled:opacity-50">
                                  {savingBlock ? '…' : 'Block'}
                                </button>
                                <button onClick={() => { setBlockingSlot(null); setBlockReason('') }}
                                  className="text-xs text-gray-400 px-1">✕</button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 py-1">
                                <button onClick={() => {
                                  setAddApptPhone(''); setAddApptFirstName(''); setAddApptLastName(''); setAddApptEmail('')
                                  setAddApptPetId(''); setAddApptPetName(''); setAddApptBreed(''); setAddApptWeight('')
                                  setAddApptVaccine('pending'); setAddApptClientData(null)
                                  setAddApptService(services[0]?.id ?? 'bath_brush')
                                  setAddingApptSlot({ date: selectedDay, time: slot })
                                }}
                                  className="text-xs bg-sky-500 text-white px-3 py-1.5 rounded-lg font-medium">
                                  + Appointment
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
          })()}

          {/* ── Appointment Detail Sheet (desktop-style, tabbed) ── */}
          {calendarDetailAppt && (() => {
            const a = calendarDetailAppt
            const gs = a.grooming_status
            const statusColors: Record<string,string> = {
              pending:'bg-amber-100 text-amber-700', confirmed:'bg-emerald-100 text-emerald-700',
              completed:'bg-gray-100 text-gray-600', cancelled:'bg-red-100 text-red-600',
            }
            const activeStaff = staff.filter(s => s.is_active && s.role !== 'admin')
            const svcDef = services.find(s => s.id === a.service)
            const tiers = (svcDef?.tiers ?? servicePricing[a.service] ?? []).filter((t: {label:string;price:string}) => t.label && t.price)
            // History = past appts for same client. Prefer the full per-client fetch
            // (fullClientAppts, covers every month/status); fall back to whatever's
            // already loaded locally while that fetch is in flight.
            const allKnownAppts = [...appointments, ...calendarAppts].filter((x,i,arr) => arr.findIndex(y=>y.id===x.id)===i)
            const clientPhone = a.client_phone
            const clientAppts = fullClientAppts ?? allKnownAppts.filter(x => x.client_phone === clientPhone)
            const pastAppts = clientAppts.filter(x => x.appointment_date < a.appointment_date || (x.appointment_date === a.appointment_date && x.id !== a.id && x.status === 'completed')).sort((x,y)=>y.appointment_date.localeCompare(x.appointment_date))
            const futureAppts = clientAppts.filter(x => x.appointment_date > a.appointment_date).sort((x,y)=>x.appointment_date.localeCompare(y.appointment_date))

            const patchAppt = async (body: Record<string,unknown>) => {
              await fetch(`/api/admin/appointments/${a.id}`, {
                method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
              })
              const updated = { ...a, ...body }
              setCalendarDetailAppt(updated as typeof a)
              fetchAppointments()
              fetchCalendar()
            }

            const TABS = [
              { key: 'appt',     label: 'Appointment' },
              { key: 'customer', label: 'Customer' },
              { key: 'history',  label: 'History' },
              { key: 'future',   label: 'Future' },
              { key: 'notes',    label: 'Notes' },
            ] as const

            return (
              <div className="fixed inset-0 z-[9999] flex flex-col" onClick={() => setCalendarDetailAppt(null)}>
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
                <div className="relative mt-auto bg-white rounded-t-3xl shadow-2xl h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>

                  {/* Handle + close */}
                  <div className="flex items-center justify-between px-5 pt-3 pb-2 flex-shrink-0">
                    <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-3" />
                    <div />
                    <button onClick={() => setCalendarDetailAppt(null)} className="ml-auto text-gray-400 text-2xl leading-none p-1">✕</button>
                  </div>

                  {/* Pet header */}
                  <div className={`px-5 pb-4 flex items-center gap-4 border-b border-gray-100 flex-shrink-0 ${
                    a.service==='simply_cute' ? 'bg-sky-50' : a.service==='bath_brush' ? 'bg-teal-50' : a.service==='asian_fusion' ? 'bg-pink-50' : 'bg-gray-50'
                  }`}>
                    {a.pets?.photo_url
                      ? <img src={a.pets.photo_url} className="w-14 h-14 rounded-2xl object-cover border-2 border-white shadow" alt="" />
                      : <div className="w-14 h-14 rounded-2xl bg-sky-100 flex items-center justify-center text-3xl">🐶</div>}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 text-lg leading-tight">{a.pets?.name ?? '—'}</p>
                      <p className="text-sm text-gray-500">{a.pets?.breed}{a.pets?.weight ? ` · ${a.pets.weight}` : ''}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{a.clients?.name} · {new Date(a.appointment_date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})} {a.appointment_time}</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0 ${statusColors[a.status]??'bg-gray-100 text-gray-500'}`}>{a.status}</span>
                  </div>

                  {/* ── Tab bar ── */}
                  <div className="flex border-b border-gray-100 bg-white overflow-x-auto flex-shrink-0">
                    {TABS.map(t => (
                      <button key={t.key} onClick={() => setDetailSheetTab(t.key)}
                        className={`flex-shrink-0 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                          detailSheetTab === t.key ? 'border-sky-500 text-sky-700' : 'border-transparent text-gray-400'
                        }`}>
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Scrollable body */}
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

                    {/* ══ APPOINTMENT TAB ══ */}
                    {detailSheetTab === 'appt' && (<>

                      {/* Confirm / Decline (pending) */}
                      {a.status === 'pending' && (
                        <div className="flex gap-3">
                          <button onClick={async () => { await patchAppt({ action:'confirm' }); showToast('✓ Confirmed!') }}
                            className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-2xl text-sm">✓ Confirm</button>
                          <button onClick={async () => { await patchAppt({ action:'decline' }); showToast('Declined') }}
                            className="flex-1 py-3 bg-rose-100 text-rose-600 font-bold rounded-2xl text-sm">✕ Decline</button>
                        </div>
                      )}

                      {/* Assign Staff */}
                      <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-4">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Assign Staff</p>
                        <div>
                          <p className="text-xs text-gray-500 mb-2">✂️ Groomer</p>
                          <div className="flex flex-wrap gap-2">
                            {['None', ...activeStaff.map(s => s.name)].map(name => {
                              const val = name === 'None' ? '' : name
                              const active = (a.assigned_groomer || '') === val
                              return (
                                <button key={name} onClick={() => patchAppt({ action:'assign-staff', assigned_groomer: val, assigned_bather: a.assigned_bather||'' })}
                                  className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all ${active ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-gray-600 border-gray-200 hover:border-rose-300'}`}>
                                  {name}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-2">🛁 Bather</p>
                          <div className="flex flex-wrap gap-2">
                            {['None', ...activeStaff.map(s => s.name)].map(name => {
                              const val = name === 'None' ? '' : name
                              const active = (a.assigned_bather || '') === val
                              return (
                                <button key={name} onClick={() => patchAppt({ action:'assign-staff', assigned_groomer: a.assigned_groomer||'', assigned_bather: val })}
                                  className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all ${active ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-gray-600 border-gray-200 hover:border-sky-300'}`}>
                                  {name}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Grooming Status */}
                      {a.status !== 'pending' && a.status !== 'cancelled' && (
                        <div className="bg-white border border-gray-100 rounded-2xl p-4">
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Grooming Status</p>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { key: 'waiting',   label: '⏳ Waiting',          style: 'bg-sky-50 border-sky-200 text-sky-700' },
                              { key: 'incare',    label: '✂️ In Good Hands',    style: 'bg-violet-50 border-violet-200 text-violet-700' },
                              { key: 'ready',     label: '🔔 Ready to Pick Up', style: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                              { key: 'done',      label: '🎉 Checked Out',      style: 'bg-gray-50 border-gray-200 text-gray-600' },
                            ].map(({ key, label, style }) => (
                              <button key={key}
                                onClick={() => patchAppt({ action:'grooming-status', grooming_status: key })}
                                className={`py-2.5 px-3 rounded-xl border-2 text-sm font-semibold text-left transition-all ${
                                  gs === key ? style + ' ring-2 ring-offset-1 ring-current' : 'bg-white border-gray-100 text-gray-400'
                                }`}>
                                {label}
                              </button>
                            ))}
                          </div>
                          {gs && (
                            <p className="text-xs text-gray-400 mt-2 text-center">
                              Current: <span className="font-semibold text-gray-600">{gs}</span>
                              {a.grooming_status_updated_at && ` · since ${new Date(a.grooming_status_updated_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:SALON_TZ})}`}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Service & Pricing */}
                      {(() => {
                        const otherServices = services.filter(s => s.id !== a.service)
                        const addOnTotal = calendarAddOns.reduce((sum, ao) => sum + (parseFloat(ao.price) || 0), 0)
                        const baseAmt = parseFloat(calendarBasePrice) || 0
                        const grandTotal = Math.round((baseAmt + addOnTotal) * 100) / 100
                        return (
                      <div className="bg-white border border-gray-100 rounded-2xl p-4">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Service & Price</p>
                        <div className="flex items-center justify-between mb-3">
                          <span className={`text-sm font-semibold px-3 py-1 rounded-full ${
                            a.service==='simply_cute' ? 'bg-sky-100 text-sky-700' :
                            a.service==='bath_brush' ? 'bg-teal-100 text-teal-700' :
                            a.service==='asian_fusion' ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-600'
                          }`}>{serviceMap[a.service] ?? a.service}</span>
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            a.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {a.payment_status === 'paid' ? `✓ Paid${a.payment_amount ? ` · $${a.payment_amount}` : ''}` : 'Unpaid'}
                          </span>
                        </div>
                        {tiers.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            {tiers.map((t: {label:string;price:string;duration?:string}) => {
                              const priceVal = t.price.replace('$','')
                              const isSelected = calendarBaseTier === t.label && calendarBasePrice === priceVal
                              return (
                              <button key={t.label}
                                onClick={() => { if (t.price) { setCalendarBasePrice(isSelected ? '' : priceVal); setCalendarBaseTier(isSelected ? '' : t.label); setCalendarTotalSaved(false) } }}
                                className={`border-2 rounded-xl p-3 text-center transition-all ${
                                  isSelected ? 'border-violet-400 bg-violet-50' : 'border-gray-100 hover:border-violet-200'
                                }`}>
                                <p className="text-xs text-gray-500">{t.label}</p>
                                <p className="text-xl font-black text-gray-800">{t.price}</p>
                                {t.duration && <p className="text-xs text-gray-400">⏱ {t.duration}</p>}
                              </button>
                              )
                            })}
                          </div>
                        )}

                        {/* Add-on Services */}
                        {(otherServices.length > 0 || calendarAddOns.length > 0) && (
                          <div className="border-t border-gray-100 pt-3 mt-1 mb-3">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Add-on Services</p>
                            {calendarAddOns.length > 0 && (
                              <div className="space-y-1.5 mb-2">
                                {calendarAddOns.map(addon => (
                                  <div key={addon.id} className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
                                    <span className="text-xs font-semibold text-sky-800 flex-1">{addon.name}</span>
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-gray-500">$</span>
                                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={addon.price}
                                        onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setCalendarAddOns(prev => prev.map(x => x.id === addon.id ? { ...x, price: v } : x)); setCalendarTotalSaved(false) }}
                                        className="w-14 text-sm font-bold text-sky-700 bg-transparent focus:outline-none text-right" />
                                    </div>
                                    <button onClick={() => { setCalendarAddOns(prev => prev.filter(x => x.id !== addon.id)); setCalendarTotalSaved(false) }}
                                      className="text-gray-300 hover:text-rose-400 text-base font-bold ml-1">✕</button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {otherServices
                                .filter(s => !calendarAddOns.find(ao => ao.id === s.id))
                                .map(s => (
                                  <button key={s.id}
                                    onClick={() => {
                                      const defaultPrice = s.tiers?.find((t: {price:string}) => t.price)?.price ?? ''
                                      setCalendarAddOns(prev => [...prev, { id: s.id, name: s.name ?? serviceMap[s.id] ?? s.id, price: defaultPrice }])
                                      setCalendarTotalSaved(false)
                                    }}
                                    className="text-xs bg-gray-100 hover:bg-sky-100 text-gray-600 hover:text-sky-700 px-2.5 py-1.5 rounded-lg font-medium transition-colors">
                                    + {s.name ?? serviceMap[s.id] ?? s.id}
                                  </button>
                                ))
                              }
                            </div>
                            <div className="flex gap-1.5">
                              <input
                                value={calendarAddonDraft.text}
                                onChange={e => setCalendarAddonDraft(prev => ({ ...prev, text: e.target.value }))}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && calendarAddonDraft.text.trim()) {
                                    setCalendarAddOns(prev => [...prev, { id: Date.now().toString(), name: calendarAddonDraft.text.trim(), price: calendarAddonDraft.price }])
                                    setCalendarAddonDraft({ text: '', price: '' })
                                    setCalendarTotalSaved(false)
                                  }
                                }}
                                placeholder="Custom add-on…"
                                className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                              />
                              <input
                                value={calendarAddonDraft.price}
                                onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setCalendarAddonDraft(prev => ({ ...prev, price: v })) }}
                                placeholder="$" type="text" inputMode="numeric"
                                className="w-12 border border-gray-200 rounded-xl px-2 py-1.5 text-xs text-center bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                              />
                              <button
                                onClick={() => {
                                  if (!calendarAddonDraft.text.trim()) return
                                  setCalendarAddOns(prev => [...prev, { id: Date.now().toString(), name: calendarAddonDraft.text.trim(), price: calendarAddonDraft.price }])
                                  setCalendarAddonDraft({ text: '', price: '' })
                                  setCalendarTotalSaved(false)
                                }}
                                disabled={!calendarAddonDraft.text.trim()}
                                className="px-2.5 py-1.5 bg-sky-500 text-white text-xs font-bold rounded-xl disabled:opacity-40">+</button>
                            </div>
                          </div>
                        )}

                        {/* Total breakdown */}
                        {(calendarBasePrice || calendarAddOns.length > 0) && (
                          <div className="bg-gray-50 rounded-xl px-3 py-2 mb-3 space-y-1 border border-gray-100">
                            {calendarBasePrice && (
                              <div className="flex justify-between text-xs text-gray-500">
                                <span>{serviceMap[a.service] ?? a.service}</span>
                                <span className="font-semibold">${calendarBasePrice}</span>
                              </div>
                            )}
                            {calendarAddOns.map(ao => (
                              <div key={ao.id} className="flex justify-between text-xs text-gray-500">
                                <span>{ao.name}</span>
                                <span className="font-semibold">${ao.price || '0'}</span>
                              </div>
                            ))}
                            <div className="flex justify-between text-sm font-bold text-gray-800 pt-1 border-t border-gray-200">
                              <span>Total</span>
                              <span className={calendarTotalSaved && grandTotal > 0 ? 'text-emerald-600' : 'text-gray-800'}>${grandTotal.toFixed(2)}</span>
                            </div>
                          </div>
                        )}

                        {/* Save Total */}
                        <button
                          disabled={grandTotal <= 0 || savingCalendarPayment}
                          onClick={async () => {
                            if (grandTotal <= 0) return
                            const amount = grandTotal.toString()
                            setSavingCalendarPayment(true)
                            try {
                              const res = await fetch(`/api/admin/appointments/${a.id}`, {
                                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  action: 'record-payment', payment_amount: amount,
                                  payment_status: a.payment_status || 'unpaid', payment_method: a.payment_method || 'cash',
                                  tip_amount: a.tip_amount || '0', size_tier: calendarBaseTier || null, addons: calendarAddOns,
                                }),
                              })
                              const data = await res.json()
                              if (data.success) {
                                const addonNotes = calendarAddOns.map(ao => ({ id: ao.id, text: ao.name, price: ao.price, is_addon: true as const, author: 'system', created_at: new Date().toISOString() }))
                                const nonAddonNotes = (a.notes_list ?? []).filter((n: {is_addon?:boolean}) => !n.is_addon)
                                const updated = { ...a, payment_amount: amount, size_tier: calendarBaseTier || null, notes_list: [...nonAddonNotes, ...addonNotes] }
                                setCalendarDetailAppt(updated as typeof a)
                                setAppointments(prev => prev.map(x => x.id === a.id ? { ...x, ...updated } : x))
                                setCalendarAppts(prev => prev.map(x => x.id === a.id ? { ...x, ...updated } : x))
                                setCalendarTotalSaved(true)
                                showToast('✓ Total saved!')
                              }
                            } catch {/**/}
                            finally { setSavingCalendarPayment(false) }
                          }}
                          className={`w-full py-2.5 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors ${
                            grandTotal <= 0 ? 'bg-gray-300' : calendarTotalSaved ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-violet-500 hover:bg-violet-600'
                          }`}>
                          {savingCalendarPayment ? '⏳ Saving…' : grandTotal > 0 ? (calendarTotalSaved ? `✓ Saved · $${grandTotal.toFixed(2)}` : `💾 Save Total · $${grandTotal.toFixed(2)}`) : 'Select a size first'}
                        </button>

                        {a.tip_amount && parseFloat(String(a.tip_amount)) > 0 && (
                          <p className="text-xs text-gray-400 mt-2">Tip: ${a.tip_amount} · Method: {a.payment_method || '—'}</p>
                        )}
                      </div>
                        )
                      })()}

                      {/* Health & Quality checks */}
                      {(a.health_check || a.grooming_quality) && (
                        <div className="space-y-2">
                          {a.health_check && (() => {
                            const hc = a.health_check as any
                            const isNew = ['eyes','ears','nose','mouth','paws','skin'].some(k => Array.isArray(hc[k]))
                            const total = ['eyes','ears','nose','mouth','paws','skin'].reduce((s:number,k:string) => {
                              const v = hc[k]; return s+(isNew?(Array.isArray(v)?v.length:0):(v===false?1:0))
                            },0)
                            const allNormal = isNew?(Array.isArray(hc.cleared_sections)&&hc.cleared_sections.length===6&&total===0):['eyes','ears','nose','mouth','paws','skin'].every(k=>hc[k]===true)
                            return (
                              <div className={`border rounded-2xl px-4 py-3 ${total>0?'bg-rose-50 border-rose-100':'bg-green-50 border-green-100'}`}>
                                <p className="text-xs font-bold uppercase tracking-wide mb-1 text-sky-600">🩺 Health Check</p>
                                {allNormal ? <p className="text-sm text-green-700 font-semibold">✅ All Normal — 一切正常</p>
                                  : total>0 ? <p className="text-sm text-rose-700 font-semibold">⚠️ {total} issue{total>1?'s':''} found</p>
                                  : <p className="text-sm text-gray-500">Completed</p>}
                                {hc.groomer_notes_english && <p className="text-xs text-gray-500 mt-1">📝 {hc.groomer_notes_english}</p>}
                              </div>
                            )
                          })()}
                          {a.grooming_quality && (() => {
                            const q = a.grooming_quality as any
                            const oldMap: Record<string,string> = {tangles_free:'coat_brushed',sanitary_trim:'bath_completed',paw_pad_trim:'paw_pads_cleared',perfume_spray:'styling_finished'}
                            const done = ['nails_trimmed','ears_cleaned','tangles_free','sanitary_trim','paw_pad_trim','perfume_spray'].filter(k=>q[k]||q[oldMap[k]??k]).length
                            return (
                              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">🎯 Quality Check</p>
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${done===6?'bg-emerald-200 text-emerald-700':'bg-gray-100 text-gray-500'}`}>{done}/6</span>
                                </div>
                                {done===6?<p className="text-sm text-emerald-700 font-semibold">✅ All Done</p>:<p className="text-sm text-gray-600">{done} of 6 items completed</p>}
                                {q.customer_note_english && <p className="text-xs text-gray-500 mt-1">💌 {q.customer_note_english}</p>}
                              </div>
                            )
                          })()}
                        </div>
                      )}

                      {/* Reschedule & Delete */}
                      <div className="space-y-2 pt-1">
                        <button
                          onClick={() => {
                            setEditApptId(a.id)
                            setEditApptDraft({ service: a.service, date: a.appointment_date, time: a.appointment_time, notes: (a as any).notes ?? '' })
                            setCalendarDetailAppt(null)
                          }}
                          className="w-full border-2 border-dashed border-sky-300 hover:border-sky-400 text-sky-600 hover:text-sky-700 font-semibold py-2.5 rounded-xl text-sm transition-colors"
                        >
                          📅 Reschedule
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Delete this appointment permanently? This cannot be undone.')) {
                              deleteAppointment(a.id)
                              setCalendarDetailAppt(null)
                            }
                          }}
                          disabled={!!deletingApptId}
                          className="w-full bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 font-semibold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
                        >
                          {deletingApptId === a.id ? '⏳ Deleting…' : '🗑 Delete Appointment'}
                        </button>
                      </div>

                      <div className="h-4" />
                    </>)}

                    {/* ══ CUSTOMER TAB ══ */}
                    {detailSheetTab === 'customer' && (<>

                      {/* Pet info */}
                      <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">🐾 Pet Details</p>
                        <div className="flex items-center gap-3">
                          {a.pets?.photo_url
                            ? <img src={a.pets.photo_url} className="w-16 h-16 rounded-2xl object-cover border-2 border-gray-100 shadow-sm flex-shrink-0" alt="" />
                            : <div className="w-16 h-16 rounded-2xl bg-sky-100 flex items-center justify-center text-3xl flex-shrink-0">🐶</div>}
                          <div className="flex-1 min-w-0 space-y-1">
                            <p className="font-bold text-gray-900 text-base">{a.pets?.name ?? '—'}</p>
                            {a.pets?.breed && <p className="text-sm text-gray-500">{a.pets.breed}</p>}
                            {a.pets?.weight && (
                              <span className="inline-block text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">{a.pets.weight}</span>
                            )}
                          </div>
                        </div>
                        {a.pets?.vaccine_status && (
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Vaccine:</p>
                            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${VACCINE_COLORS[a.pets.vaccine_status] ?? 'bg-gray-100 text-gray-500'}`}>
                              {a.pets.vaccine_status === 'verified' ? '✅ Verified' :
                               a.pets.vaccine_status === 'email_sent' ? '📧 Email Sent' :
                               a.pets.vaccine_status === 'expired' ? '❌ Expired' : '⏳ Pending'}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Owner info */}
                      {a.clients && (
                        <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">👤 Owner</p>
                          <p className="font-semibold text-gray-800 text-base">{a.clients.name}</p>
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <span className="text-gray-400">📞</span>
                              <a href={`tel:${a.clients.phone}`} className="text-sky-600 font-medium">{a.clients.phone}</a>
                            </div>
                            {a.clients.email && (
                              <div className="flex items-center gap-2 text-sm text-gray-600">
                                <span className="text-gray-400">✉️</span>
                                <span className="truncate">{a.clients.email}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 pt-1">
                            <a href={`tel:${a.clients.phone}`} className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 text-white text-sm font-bold px-3 py-2.5 rounded-xl">📞 Call</a>
                            <a href={`sms:${a.clients.phone}`} className="flex-1 flex items-center justify-center gap-1.5 bg-sky-500 text-white text-sm font-bold px-3 py-2.5 rounded-xl">💬 Text</a>
                          </div>
                        </div>
                      )}

                      <div className="h-4" />
                    </>)}

                    {/* ══ HISTORY TAB ══ */}
                    {detailSheetTab === 'history' && (<>

                      {/* ── helper: render full health + quality detail for any appt ── */}
                      {(() => {
                        const HC_SECTIONS = [
                          { key: 'eyes',  emoji: '👁️', label: 'Eyes',          labelZh: '眼睛' },
                          { key: 'ears',  emoji: '👂', label: 'Ears',          labelZh: '耳朵' },
                          { key: 'nose',  emoji: '👃', label: 'Nose',          labelZh: '鼻子' },
                          { key: 'mouth', emoji: '😬', label: 'Mouth / Teeth', labelZh: '嘴巴/牙齒' },
                          { key: 'paws',  emoji: '🐾', label: 'Paw Pads',      labelZh: '腳掌' },
                          { key: 'skin',  emoji: '🧴', label: 'Skin & Coat',   labelZh: '皮膚/毛髮' },
                        ]
                        const GQ_ITEMS = [
                          { key: 'nails_trimmed', oldKey: 'nails_trimmed', emoji: '✂️', en: 'Nails Trimmed',  zh: '剪指甲' },
                          { key: 'ears_cleaned',  oldKey: 'ears_cleaned',  emoji: '👂', en: 'Ears Cleaned',   zh: '清耳朵' },
                          { key: 'tangles_free',  oldKey: 'coat_brushed',  emoji: '🪮', en: 'Tangles Free',   zh: '無毛結' },
                          { key: 'sanitary_trim', oldKey: 'bath_completed',emoji: '🧼', en: 'Sanitary Trim',  zh: '衛生修剪' },
                          { key: 'paw_pad_trim',  oldKey: 'paw_pads_cleared',emoji:'🐾',en: 'Paw Pad Trim',  zh: '腳掌修剪' },
                          { key: 'perfume_spray', oldKey: 'styling_finished',emoji:'🌸',en: 'Perfume Spray',  zh: '噴香水' },
                        ]

                        const renderVisitCard = (appt: Appointment, isCurrentVisit: boolean) => {
                          const hc = appt.health_check as any
                          const gq = appt.grooming_quality as any

                          // Health check detail
                          let hcDetail = null
                          if (hc) {
                            const isNew = HC_SECTIONS.some(s => Array.isArray(hc[s.key]))
                            const cleared: string[] = Array.isArray(hc.cleared_sections) ? hc.cleared_sections : []
                            const totalIssues = HC_SECTIONS.reduce((sum, s) => {
                              const v = hc[s.key]; return sum + (isNew ? (Array.isArray(v) ? v.length : 0) : (v === false ? 1 : 0))
                            }, 0)
                            const allNormal = isNew ? (cleared.length === 6 && totalIssues === 0) : HC_SECTIONS.every(s => hc[s.key] === true)
                            hcDetail = (
                              <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 space-y-2">
                                <p className="text-xs font-bold text-sky-700 uppercase tracking-wide">🩺 Health Check</p>
                                {allNormal ? (
                                  <p className="text-xs font-semibold text-green-700">✅ All Normal — 一切正常</p>
                                ) : (
                                  <div className="space-y-1">
                                    {HC_SECTIONS.map(s => {
                                      const val = hc[s.key]
                                      const issues: string[] = isNew ? (Array.isArray(val) ? val : []) : (val === false ? [s.label] : [])
                                      const isCleared = isNew ? cleared.includes(s.key) : val === true
                                      if (isCleared && issues.length === 0) return (
                                        <div key={s.key} className="flex items-center gap-1.5 text-xs text-green-600">
                                          <span>{s.emoji}</span><span className="font-medium">{s.label}</span><span className="text-green-400">· Normal ✓</span>
                                        </div>
                                      )
                                      if (issues.length > 0) return (
                                        <div key={s.key} className="bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-1.5">
                                          <p className="text-xs font-semibold text-rose-700">{s.emoji} {s.label} <span className="text-rose-400">/ {s.labelZh}</span></p>
                                          {issues.map((iss:string) => <p key={iss} className="text-xs text-rose-600">⚠️ {iss.replace(/_/g,' ')}</p>)}
                                        </div>
                                      )
                                      return null
                                    })}
                                  </div>
                                )}
                                {hc.groomer_notes_english && (
                                  <div className="bg-white border border-rose-100 rounded-lg px-2.5 py-1.5">
                                    <p className="text-xs font-semibold text-rose-600">🏥 Health Concerns / 健康狀況</p>
                                    <p className="text-xs text-gray-600 mt-0.5">{hc.groomer_notes_english}</p>
                                    {hc.groomer_notes_chinese && <p className="text-xs text-gray-400">{hc.groomer_notes_chinese}</p>}
                                  </div>
                                )}
                              </div>
                            )
                          }

                          // Quality check detail
                          let gqDetail = null
                          if (gq) {
                            const doneCount = GQ_ITEMS.filter(i => gq[i.key] || gq[i.oldKey]).length
                            const allDone = doneCount === GQ_ITEMS.length
                            gqDetail = (
                              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">🎯 Quality Check</p>
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${allDone ? 'bg-emerald-200 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{doneCount}/6</span>
                                </div>
                                <div className="grid grid-cols-2 gap-1">
                                  {GQ_ITEMS.map(item => {
                                    const done = gq[item.key] || gq[item.oldKey]
                                    return (
                                      <div key={item.key} className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${done ? 'bg-white border border-emerald-200 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                                        <span>{item.emoji}</span>
                                        <span className="font-medium leading-tight">{item.en}{done ? ' ✓' : ''}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                                {(gq.groomer_diary || gq.groomer_diary_english) && (
                                  <div className="bg-purple-50 border border-purple-100 rounded-lg px-2.5 py-1.5">
                                    <p className="text-xs font-semibold text-purple-600">📓 Groomer Notes / 美容師工作日記</p>
                                    <p className="text-xs text-gray-600 mt-0.5">{gq.groomer_diary_english || gq.groomer_diary}</p>
                                    {gq.groomer_diary_traditional && gq.groomer_diary_traditional !== (gq.groomer_diary_english || gq.groomer_diary) && (
                                      <p className="text-xs text-gray-400">{gq.groomer_diary_traditional}</p>
                                    )}
                                  </div>
                                )}
                                {gq.customer_note_english && (
                                  <div className="bg-green-50 border border-green-100 rounded-lg px-2.5 py-1.5">
                                    <p className="text-xs font-semibold text-green-600">💌 Note to Customer</p>
                                    <p className="text-xs text-gray-600 mt-0.5">{gq.customer_note_english}</p>
                                  </div>
                                )}
                              </div>
                            )
                          }

                          return (
                            <div key={appt.id} className={`rounded-2xl p-4 space-y-3 ${isCurrentVisit ? 'bg-sky-50 border-2 border-sky-200' : 'bg-white border border-gray-100'}`}>
                              {isCurrentVisit && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-sky-600 bg-sky-100 px-2 py-0.5 rounded-full">📌 This Visit</span>
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[appt.status]??'bg-gray-100 text-gray-500'}`}>{appt.status}</span>
                                </div>
                              )}
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-gray-800">{serviceMap[appt.service] ?? appt.service}</p>
                                  <p className="text-xs text-gray-400">{new Date(appt.appointment_date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})} · {appt.appointment_time}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  {appt.payment_amount && <p className="text-sm font-bold text-gray-700">${appt.payment_amount}</p>}
                                  {!isCurrentVisit && <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[appt.status]??'bg-gray-100 text-gray-500'}`}>{appt.status}</span>}
                                </div>
                              </div>
                              {(appt.assigned_groomer || appt.assigned_bather) && (
                                <p className="text-xs text-gray-400">
                                  {appt.assigned_groomer && `✂️ ${appt.assigned_groomer}`}{appt.assigned_groomer && appt.assigned_bather ? ' · ' : ''}{appt.assigned_bather && `🛁 ${appt.assigned_bather}`}
                                </p>
                              )}
                              {hcDetail}
                              {gqDetail}
                            </div>
                          )
                        }

                        return (
                          <div className="space-y-4">
                            {renderVisitCard(a, true)}
                            {pastAppts.length === 0 ? (
                              <div className="bg-gray-50 rounded-2xl p-8 text-center">
                                <p className="text-2xl mb-2">📋</p>
                                <p className="text-sm text-gray-400">No previous visits found</p>
                              </div>
                            ) : (
                              <>
                                <p className="text-xs text-gray-400 px-1">{pastAppts.length} previous visit{pastAppts.length!==1?'s':''}</p>
                                {pastAppts.map(h => renderVisitCard(h, false))}
                              </>
                            )}
                          </div>
                        )
                      })()}

                      <div className="h-4" />
                    </>)}

                    {/* ══ FUTURE TAB ══ */}
                    {detailSheetTab === 'future' && (<>

                      {futureAppts.length === 0 ? (
                        <div className="bg-gray-50 rounded-2xl p-8 text-center">
                          <p className="text-2xl mb-2">📅</p>
                          <p className="text-sm text-gray-400">No upcoming appointments</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-xs text-gray-400">{futureAppts.length} upcoming appointment{futureAppts.length!==1?'s':''}</p>
                          {futureAppts.map(f => (
                            <div key={f.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-3">
                              {f.pets?.photo_url
                                ? <img src={f.pets.photo_url} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" alt="" />
                                : <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center text-lg flex-shrink-0">🐶</div>}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800">{f.pets?.name}</p>
                                <p className="text-xs text-gray-500">{serviceMap[f.service]??f.service}</p>
                                <p className="text-xs text-gray-400">{new Date(f.appointment_date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})} · {f.appointment_time}</p>
                              </div>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${statusColors[f.status]??'bg-gray-100 text-gray-500'}`}>{f.status}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="h-4" />
                    </>)}

                    {/* ══ NOTES TAB ══ */}
                    {detailSheetTab === 'notes' && (<>

                      {/* Customer note */}
                      {(a.notes || a.notes_english || a.notes_chinese) ? (
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-2">
                          <p className="text-xs font-bold text-amber-600 uppercase tracking-wide">📋 Customer Note</p>
                          {a.notes && <p className="text-sm text-gray-800">{a.notes}</p>}
                          {a.notes_english && <p className="text-xs text-gray-500">🇺🇸 {a.notes_english}</p>}
                          {a.notes_chinese && <p className="text-xs text-gray-500">🇹🇼 {a.notes_chinese}</p>}
                        </div>
                      ) : (
                        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">📋 Customer Note</p>
                          <p className="text-sm text-gray-400 italic">No customer note</p>
                        </div>
                      )}

                      {/* Notes list */}
                      {a.notes_list && a.notes_list.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">📝 Staff Notes</p>
                          {[...a.notes_list].reverse().map((n: NoteEntry, i: number) => (
                            <div key={n.id ?? i} className="bg-white border border-gray-100 rounded-2xl p-4">
                              {n.author && <p className="text-xs font-semibold text-gray-400 mb-1">✂️ {n.author}</p>}
                              {n.notes_english && <p className="text-sm text-gray-800">🇺🇸 {n.notes_english}</p>}
                              {n.notes_chinese && <p className="text-sm text-gray-600 mt-1">🇹🇼 {n.notes_chinese}</p>}
                              {!n.notes_english && !n.notes_chinese && n.text && <p className="text-sm text-gray-700">{n.text}</p>}
                              {n.created_at && <p className="text-xs text-gray-300 mt-2">{new Date(n.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</p>}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Groomer notes from latest quality check */}
                      {(a.grooming_quality?.groomer_diary || a.grooming_quality?.groomer_diary_english) && (
                        <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 space-y-1">
                          <p className="text-xs font-bold text-purple-600 uppercase tracking-wide">📓 Groomer Notes / 美容師工作日記</p>
                          <p className="text-sm text-gray-700">{a.grooming_quality.groomer_diary_english || a.grooming_quality.groomer_diary}</p>
                          {a.grooming_quality.groomer_diary_traditional && a.grooming_quality.groomer_diary_traditional !== (a.grooming_quality.groomer_diary_english || a.grooming_quality.groomer_diary) && (
                            <p className="text-sm text-gray-400">{a.grooming_quality.groomer_diary_traditional}</p>
                          )}
                        </div>
                      )}

                      {/* Note to customer from quality check */}
                      {a.grooming_quality?.customer_note_english && (
                        <div className="bg-green-50 border border-green-100 rounded-2xl p-4 space-y-1">
                          <p className="text-xs font-bold text-green-600 uppercase tracking-wide">💌 Note to Customer</p>
                          <p className="text-sm text-gray-700">🇺🇸 {a.grooming_quality.customer_note_english}</p>
                          {a.grooming_quality.customer_note_traditional && (
                            <p className="text-sm text-gray-600">🇹🇼 {a.grooming_quality.customer_note_traditional}</p>
                          )}
                          {a.grooming_quality.customer_note_simplified && (
                            <p className="text-sm text-gray-600">🇨🇳 {a.grooming_quality.customer_note_simplified}</p>
                          )}
                        </div>
                      )}

                      {!a.notes && !a.notes_list?.length && !a.grooming_quality?.groomer_diary && !a.grooming_quality?.customer_note_english && (
                        <div className="bg-gray-50 rounded-2xl p-8 text-center">
                          <p className="text-2xl mb-2">📝</p>
                          <p className="text-sm text-gray-400">No notes yet</p>
                        </div>
                      )}

                      <div className="h-4" />
                    </>)}

                  </div>
                </div>
              </div>
            )
          })()}

          {/* ── Settings Tab ── */}
          {tab === 'settings' && (
            <div className="max-w-2xl mx-auto p-4 space-y-6">
              {settingsLoading ? (
                <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
              ) : (
                <>
                  {/* Timezone */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h2 className="font-bold text-gray-800 mb-1">Timezone</h2>
                    <p className="text-xs text-gray-400 mb-4">All appointment times will display in this timezone</p>
                    <select
                      value={timezone}
                      onChange={e => setTimezone(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 mb-3"
                    >
                      {TIMEZONES.map(tz => (
                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={saveTimezone}
                      className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
                    >
                      {settingsSaved ? 'Saved!' : 'Save Timezone'}
                    </button>
                  </div>

                  {/* Business Hours */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="font-bold text-gray-800">Business Hours</h2>
                        <p className="text-xs text-gray-400 mt-0.5">Days and hours you accept appointments</p>
                      </div>
                      <button onClick={async () => {
                        try {
                          const responses = await Promise.all([
                            fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'open_days', value: JSON.stringify(openDays) }) }),
                            fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'open_time', value: openTime }) }),
                            fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'close_time', value: closeTime }) }),
                            fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'appointment_interval', value: String(appointmentInterval) }) }),
                          ])
                          for (let i = 0; i < responses.length; i++) {
                            if (!responses[i].ok) {
                              const error = await responses[i].json()
                              console.error(`Failed to save business hours setting ${i}:`, error)
                              alert(`Error saving business hours: ${error.error || 'Unknown error'}`)
                              return
                            }
                          }
                          console.log('✓ Business hours saved successfully')
                          setHoursSaved(true); setTimeout(() => setHoursSaved(false), 2000)
                        } catch (error) {
                          console.error('Failed to save business hours:', error)
                          alert(`Error saving business hours: ${error instanceof Error ? error.message : 'Unknown error'}`)
                        }
                      }} className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors ${hoursSaved ? 'bg-emerald-500 text-white' : 'bg-sky-500 hover:bg-sky-600 text-white'}`}>
                        {hoursSaved ? '✓ Saved!' : 'Save'}
                      </button>
                    </div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Open Days</p>
                    <div className="flex gap-2 flex-wrap mb-4">
                      {DAY_NAMES.map((day, idx) => (
                        <button key={idx} onClick={() => setOpenDays(prev => prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx].sort((a,b) => a - b))}
                          className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${openDays.includes(idx) ? 'bg-sky-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                          {day}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Opening Time</p>
                        <select value={openTime} onChange={e => setOpenTime(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                          {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Closing Time</p>
                        <select value={closeTime} onChange={e => setCloseTime(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                          {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Appointment Interval</p>
                    <div className="flex gap-2">
                      {([15, 30] as const).map(val => (
                        <button key={val} onClick={() => setAppointmentInterval(val)}
                          className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${appointmentInterval === val ? 'bg-sky-500 text-white border-sky-500' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-sky-300'}`}>
                          Every {val} min
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Services & Pricing (merged) */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="font-bold text-gray-800">Services & Pricing</h2>
                        <p className="text-xs text-gray-400 mt-0.5">Name, price, and duration per size</p>
                      </div>
                      <button onClick={saveServices}
                        className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors ${servicesSaved ? 'bg-emerald-500 text-white' : 'bg-sky-500 hover:bg-sky-600 text-white'}`}>
                        {servicesSaved ? '✓ Saved!' : 'Save'}
                      </button>
                    </div>
                    <div className="space-y-4">
                      {services.map((svc, idx) => (
                        <div key={svc.id} className="border border-gray-200 rounded-2xl overflow-hidden">
                          {/* Header */}
                          <div className="bg-gray-50 px-4 py-3 flex items-center gap-2">
                            <input type="text" value={svc.name}
                              onChange={e => setServices(prev => prev.map((s, i) => i === idx ? { ...s, name: e.target.value } : s))}
                              placeholder="Service name"
                              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white" />
                            <button onClick={() => setServices(prev => prev.filter((_, i) => i !== idx))}
                              className="text-gray-300 hover:text-rose-500 text-2xl leading-none">×</button>
                          </div>
                          {/* Description */}
                          <div className="px-4 py-2.5 border-b border-gray-100">
                            <input type="text" value={svc.desc}
                              onChange={e => setServices(prev => prev.map((s, i) => i === idx ? { ...s, desc: e.target.value } : s))}
                              placeholder="Description shown on booking form…"
                              className="w-full text-sm text-gray-500 placeholder-gray-300 focus:outline-none" />
                          </div>
                          {/* Tiers */}
                          <div className="px-4 py-3 space-y-2">
                            <div className="flex gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                              <span className="flex-1">Size</span>
                              <span className="w-16 text-center">Price</span>
                              <span className="w-16 text-center">Time</span>
                              <span className="w-5" />
                            </div>
                            {(svc.tiers || []).map((tier, ti) => (
                              <div key={ti} className="flex items-center gap-1">
                                <input type="text" value={tier.label}
                                  onChange={e => setServices(prev => prev.map((s, i) => i === idx ? { ...s, tiers: (s.tiers||[]).map((t, j) => j === ti ? { ...t, label: e.target.value } : t) } : s))}
                                  placeholder="e.g. Small"
                                  className="flex-1 border border-gray-100 rounded-lg px-2.5 py-1.5 text-xs bg-gray-50 focus:outline-none focus:ring-1 focus:ring-sky-300" />
                                <div className="w-16 flex items-center gap-0.5 border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                                  <span className="text-gray-400 text-xs">$</span>
                                  <input type="text" inputMode="numeric" pattern="[0-9]*" value={tier.price}
                                    onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setServices(prev => prev.map((s, i) => i === idx ? { ...s, tiers: (s.tiers||[]).map((t, j) => j === ti ? { ...t, price: v } : t) } : s)) }}
                                    placeholder="0"
                                    className="w-full text-xs text-right focus:outline-none bg-transparent font-semibold" />
                                </div>
                                <div className="w-16 flex items-center gap-0.5 border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                                  <span className="text-gray-300 text-xs">⏱</span>
                                  <input type="text" value={tier.duration || ''}
                                    onChange={e => setServices(prev => prev.map((s, i) => i === idx ? { ...s, tiers: (s.tiers||[]).map((t, j) => j === ti ? { ...t, duration: e.target.value } : t) } : s))}
                                    placeholder="1hr"
                                    className="w-full text-xs focus:outline-none bg-transparent text-gray-700" />
                                </div>
                                <button onClick={() => setServices(prev => prev.map((s, i) => i === idx ? { ...s, tiers: (s.tiers||[]).filter((_, j) => j !== ti) } : s))}
                                  className="text-gray-300 hover:text-rose-400 text-lg leading-none w-5 text-center">×</button>
                              </div>
                            ))}
                            <button onClick={() => setServices(prev => prev.map((s, i) => i === idx ? { ...s, tiers: [...(s.tiers||[]), { label: '', price: '', duration: '' }] } : s))}
                              className="text-xs text-sky-500 hover:text-sky-700 font-medium mt-1">
                              + Add size tier
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => setServices(prev => [...prev, { id: `service_${Date.now()}`, name: '', desc: '', price: '', tiers: DEFAULT_TIERS.map(t => ({...t})) }])}
                      className="w-full mt-4 border-2 border-dashed border-sky-200 hover:border-sky-400 text-sky-500 font-semibold py-2.5 rounded-xl text-sm transition-colors">
                      + Add Service
                    </button>
                  </div>

                  {/* Days Off */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h2 className="font-bold text-gray-800 mb-1">Days Off</h2>
                    <p className="text-xs text-gray-400 mb-4">Block specific dates — holidays, vacations, etc.</p>

                  <div className="space-y-2 mb-4">
                    <input
                      type="date"
                      value={newBlockDate}
                      onChange={e => setNewBlockDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                    <input
                      type="text"
                      placeholder="Reason (optional — e.g. Thanksgiving)"
                      value={newBlockReason}
                      onChange={e => setNewBlockReason(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addBlockedDate()}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                    <button
                      onClick={addBlockedDate}
                      disabled={!newBlockDate}
                      className="w-full bg-rose-50 hover:bg-rose-100 disabled:opacity-40 text-rose-600 font-semibold py-2.5 rounded-xl text-sm transition-colors border border-rose-200"
                    >
                      Block This Date
                    </button>
                  </div>

                  {blockedDatesList.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-2">No days off scheduled</p>
                  ) : (
                    <div className="space-y-2">
                      {blockedDatesList.map(bd => (
                        <div key={bd.date} className="flex items-center justify-between p-3 rounded-xl bg-rose-50 border border-rose-100">
                          <div>
                            <p className="font-medium text-gray-800 text-sm">
                              {new Date(bd.date + 'T12:00:00').toLocaleDateString('en-US', {
                                weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                              })}
                            </p>
                            {bd.reason && <p className="text-xs text-gray-500">{bd.reason}</p>}
                          </div>
                          <button
                            onClick={() => removeBlockedDate(bd.date)}
                            className="text-xs text-rose-500 hover:text-rose-700 font-medium ml-4 shrink-0"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  </div>

                  {/* Staff */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-1">
                      <h2 className="font-bold text-gray-800">Staff</h2>
                      <a href="/admin/settings"
                        className="text-xs text-sky-600 font-semibold bg-sky-50 px-3 py-1.5 rounded-full hover:bg-sky-100 transition-colors">
                        ⚙️ Full Settings →
                      </a>
                    </div>
                    <p className="text-xs text-gray-400 mb-4">Tap Full Settings to manage login credentials, commissions & permissions.</p>

                  {/* Staff list — view only on mobile, manage in full settings */}
                  {staff.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No staff yet — add in Full Settings</p>
                  ) : (
                    <div className="space-y-2">
                      {staff.map(member => (
                        <div key={member.id} className={`flex items-center justify-between p-3 rounded-xl border ${member.is_active ? 'border-gray-100 bg-gray-50' : 'border-gray-100 bg-white opacity-50'}`}>
                          <div>
                            <p className="font-medium text-gray-800 text-sm">{member.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-xs text-gray-400 capitalize">{member.role}</p>
                              {member.commission_percent > 0 && (
                                <span className="text-xs text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">{member.commission_percent}% commission</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => toggleStaff(member.id, !member.is_active)}
                            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                              member.is_active
                                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                            }`}
                          >
                            {member.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  </div>

                  {/* Clients shortcut */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="font-bold text-gray-800 mb-0.5">Pet Parents</h2>
                        <p className="text-xs text-gray-400">View client profiles and appointment history</p>
                      </div>
                      <button onClick={() => setTab('customers')}
                        className="text-sm text-sky-600 font-semibold bg-sky-50 px-4 py-2 rounded-xl hover:bg-sky-100 transition-colors">
                        View →
                      </button>
                    </div>
                  </div>

                  {/* ── TAGS ──────────────────────── */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h2 className="font-bold text-gray-800 mb-1">🏷️ Pet Tags</h2>
                    <p className="text-xs text-gray-400 mb-4">Color-coded labels to categorize pets (Aggressive, Senior, VIP…)</p>

                    <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 mb-4 space-y-2">
                      <input
                        placeholder="Tag name"
                        value={newTagName}
                        onChange={e => setNewTagName(e.target.value)}
                        className="w-full border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                      />
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Color</p>
                        <div className="flex flex-wrap gap-1.5">
                          {['sky','rose','amber','violet','emerald','teal','pink','gray','indigo','orange'].map(c => {
                            const swatch: Record<string,string> = {
                              sky:'bg-sky-500', rose:'bg-rose-500', amber:'bg-amber-500', violet:'bg-violet-500',
                              emerald:'bg-emerald-500', teal:'bg-teal-500', pink:'bg-pink-500', gray:'bg-gray-500',
                              indigo:'bg-indigo-500', orange:'bg-orange-500',
                            }
                            return (
                              <button key={c} type="button" onClick={() => setNewTagColor(c)}
                                className={`w-7 h-7 rounded-full ${swatch[c]} ${newTagColor === c ? 'ring-2 ring-offset-2 ring-sky-600' : ''}`} />
                            )
                          })}
                        </div>
                      </div>
                      <button
                        disabled={savingTag || !newTagName.trim()}
                        onClick={async () => {
                          setSavingTag(true)
                          try {
                            const res = await fetch('/api/admin/tags', {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
                            })
                            const data = await res.json()
                            if (data.tag) {
                              setTagsList(prev => [...prev, data.tag].sort((a,b) => a.name.localeCompare(b.name)))
                              setNewTagName(''); setNewTagColor('sky')
                            } else if (data.error) { alert(data.error) }
                          } finally { setSavingTag(false) }
                        }}
                        className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg">
                        {savingTag ? 'Adding…' : '+ Add Tag'}
                      </button>
                    </div>

                    {tagsList.length === 0
                      ? <p className="text-sm text-gray-400 italic">No tags yet</p>
                      : <div className="flex flex-wrap gap-2">
                          {tagsList.map(tag => (
                            <div key={tag.id} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium ${tagClasses(tag.color)}`}>
                              <span>{tag.name}</span>
                              <button
                                onClick={async () => {
                                  if (!confirm(`Delete "${tag.name}"?`)) return
                                  await fetch('/api/admin/tags', {
                                    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id: tag.id }),
                                  })
                                  setTagsList(prev => prev.filter(t => t.id !== tag.id))
                                }}
                                className="hover:bg-black/10 rounded-full w-4 h-4 flex items-center justify-center text-xs">✕</button>
                            </div>
                          ))}
                        </div>}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Checkout Tab ── */}
          {tab === 'checkout' && (() => {
            const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' })
            // Today's collection lists (always today) — drive the payment list below.
            const paidAppts  = checkoutAppts.filter(a => a.payment_status === 'paid')
            const unpaidAppts = checkoutAppts.filter(a => a.payment_status !== 'paid' && a.status !== 'cancelled')

            // ── Period report (mirrors the desktop Reports tab) ──
            const tzStr = (dt: Date) => dt.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
            const todayStr = tzStr(new Date())
            const yd = new Date(); yd.setDate(yd.getDate() - 1); const yesterdayStr = tzStr(yd)
            const wa = new Date(); wa.setDate(wa.getDate() - 6); const weekAgoStr = tzStr(wa)
            const monthStart = todayStr.slice(0, 7) + '-01'
            const [yNow, mNow] = todayStr.split('-').map(Number)
            const lmDate = new Date(yNow, mNow - 1, 1); lmDate.setMonth(lmDate.getMonth() - 1)
            const lastMonthStart = `${lmDate.getFullYear()}-${String(lmDate.getMonth() + 1).padStart(2, '0')}-01`
            const inReportRange = (date: string) => {
              if (reportRange === 'today') return date === todayStr
              if (reportRange === 'yesterday') return date === yesterdayStr
              if (reportRange === 'week') return date >= weekAgoStr
              if (reportRange === 'month') return date >= monthStart
              if (reportRange === 'last_month') return date >= lastMonthStart && date < monthStart
              if (reportRange === 'custom') return !!reportCustomDate && date === reportCustomDate
              return true // all
            }
            const reportSrc = reportRange === 'today' ? checkoutAppts : reportAppts
            const rangeAppts = reportSrc.filter(a => a.payment_status === 'paid' && inReportRange(a.appointment_date))
            const totalRevenue = rangeAppts.reduce((s, a) => s + parseFloat(a.payment_amount || '0'), 0)
            const totalTips    = rangeAppts.reduce((s, a) => s + parseFloat(a.tip_amount    || '0'), 0)
            const totalAll     = totalRevenue + totalTips
            const fmtDay = (dstr: string) => dstr ? new Date(dstr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Pick a day'
            const rangeLabel: string = reportRange === 'custom'
              ? fmtDay(reportCustomDate)
              : ({ today: 'Today', yesterday: 'Yesterday', week: 'Last 7 Days', month: 'This Month', last_month: 'Last Month', all: 'All Time' } as Record<string, string>)[reportRange]
            const reportBusy = reportRange !== 'today' && reportLoading

            // Payment method breakdown (selected period)
            const methodTotals: Record<string, number> = {}
            rangeAppts.forEach(a => {
              const m = a.payment_method || 'other'
              methodTotals[m] = (methodTotals[m] || 0) + parseFloat(a.payment_amount || '0')
            })
            const methodIcons: Record<string, string> = { cash: '💵', card: '💳', venmo: '📱', zelle: '🔵', check: '📝', other: '⋯' }

            // Per-groomer breakdown (selected period)
            const groomerAgg: Record<string, { name: string; rev: number; tips: number; count: number }> = {}
            rangeAppts.forEach(a => {
              const k = a.assigned_groomer || '(Unassigned)'
              if (!groomerAgg[k]) groomerAgg[k] = { name: k, rev: 0, tips: 0, count: 0 }
              groomerAgg[k].rev += parseFloat(a.payment_amount || '0')
              groomerAgg[k].tips += parseFloat(a.tip_amount || '0')
              groomerAgg[k].count += 1
            })
            const groomerRows = Object.values(groomerAgg).sort((a, b) => b.rev - a.rev)
            const periodChips: { k: typeof reportRange; label: string }[] = [
              { k: 'today', label: 'Today' }, { k: 'yesterday', label: 'Yesterday' }, { k: 'week', label: 'Week' },
              { k: 'month', label: 'Month' }, { k: 'last_month', label: 'Last Mo' }, { k: 'all', label: 'All' },
              { k: 'custom', label: '📅 Day' },
            ]

            return (
              <div className="pb-6">
                {checkoutLoading && <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>}
                {!checkoutLoading && (
                  <>
                    {/* ── Sales Report Header (period-aware) ── */}
                    <div className="bg-[#1e2a4a] px-4 pt-4 pb-5">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-white/60 text-xs font-medium">📊 Sales Report</p>
                          <p className="text-white text-sm font-bold">{reportRange === 'today' ? todayLabel : rangeLabel}</p>
                        </div>
                        <button onClick={() => { fetchCheckout(); if (reportRange !== 'today') fetchReportAppts() }} className="text-white/60 hover:text-white text-sm px-2 py-1 rounded-lg border border-white/20">↻ Refresh</button>
                      </div>
                      {/* Period selector — grid forces 2 rows (4 + 3), never scrolls */}
                      <div className="grid grid-cols-4 gap-1.5 mb-3">
                        {periodChips.map(c => (
                          <button key={c.k} onClick={() => setReportRange(c.k)}
                            className={`px-2 py-1.5 rounded-full text-xs font-bold text-center truncate transition-colors ${reportRange === c.k ? 'bg-sky-500 text-white' : 'bg-white/10 text-white/70'}`}>
                            {c.label}
                          </button>
                        ))}
                      </div>
                      {/* Pick-a-day date picker */}
                      {reportRange === 'custom' && (
                        <div className="mb-3 flex items-center gap-2">
                          <input
                            type="date"
                            value={reportCustomDate}
                            max={todayStr}
                            onChange={e => setReportCustomDate(e.target.value)}
                            className="bg-white/10 text-white text-sm rounded-lg px-3 py-2 border border-white/20 focus:outline-none [color-scheme:dark]"
                          />
                          {!reportCustomDate && <span className="text-white/50 text-xs">Choose a day to see its totals</span>}
                        </div>
                      )}
                      {/* Big numbers */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-white/10 rounded-xl p-3 text-center">
                          <p className="text-white text-xl font-black">${totalRevenue.toFixed(0)}</p>
                          <p className="text-white/60 text-[10px] font-bold uppercase tracking-wide mt-0.5">Revenue</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-3 text-center">
                          <p className="text-emerald-300 text-xl font-black">${totalTips.toFixed(0)}</p>
                          <p className="text-white/60 text-[10px] font-bold uppercase tracking-wide mt-0.5">Tips</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-3 text-center">
                          <p className="text-sky-300 text-xl font-black">${totalAll.toFixed(0)}</p>
                          <p className="text-white/60 text-[10px] font-bold uppercase tracking-wide mt-0.5">Total</p>
                        </div>
                      </div>
                      <p className="text-white/50 text-[11px] mt-2">{reportBusy ? 'Loading…' : `${rangeAppts.length} pet${rangeAppts.length === 1 ? '' : 's'} paid · ${rangeLabel}`}</p>
                      {/* Method breakdown */}
                      {Object.keys(methodTotals).length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {Object.entries(methodTotals).map(([m, amt]) => (
                            <span key={m} className="bg-white/10 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                              {methodIcons[m] ?? '⋯'} {m.charAt(0).toUpperCase() + m.slice(1)}: ${amt.toFixed(0)}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Per-groomer breakdown */}
                      {groomerRows.length > 0 && (
                        <div className="mt-3 bg-white/5 rounded-xl p-2.5 space-y-1.5">
                          <p className="text-white/50 text-[10px] font-bold uppercase tracking-wide px-1">By Groomer</p>
                          {groomerRows.map(g => (
                            <div key={g.name} className="flex items-center justify-between px-1">
                              <span className="text-white/90 text-xs font-medium truncate">{g.name.split(' ')[0]}</span>
                              <span className="text-white/70 text-xs shrink-0">{g.count} · <span className="text-white font-bold">${g.rev.toFixed(0)}</span>{g.tips > 0 && <span className="text-emerald-300"> +${g.tips.toFixed(0)} tip</span>}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Paid count */}
                      <div className="flex items-center gap-2 mt-3">
                        <div className="flex-1 bg-white/10 rounded-lg px-3 py-1.5 flex items-center justify-between">
                          <span className="text-white/70 text-xs">Paid</span>
                          <span className="text-white font-bold text-sm">{paidAppts.length}</span>
                        </div>
                        <div className="flex-1 bg-amber-500/30 rounded-lg px-3 py-1.5 flex items-center justify-between">
                          <span className="text-amber-200 text-xs">Pending</span>
                          <span className="text-amber-200 font-bold text-sm">{unpaidAppts.length}</span>
                        </div>
                      </div>
                    </div>

                    {/* ── Unpaid — tap to record payment ── */}
                    {unpaidAppts.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white text-xs font-bold uppercase tracking-wider sticky top-0 z-10">
                          <span>⚠️ Needs Payment</span>
                          <span className="bg-white/25 px-2 py-0.5 rounded-full">{unpaidAppts.length}</span>
                        </div>
                        <div className="bg-white divide-y divide-gray-100">
                          {unpaidAppts.map(appt => {
                            const isExpanded = expandedCheckoutId === appt.id
                            return (
                              <div key={appt.id}>
                                <button className="w-full flex items-center gap-3 px-4 py-3 text-left"
                                  onClick={() => setExpandedCheckoutId(isExpanded ? null : appt.id)}>
                                  {appt.pets?.photo_url
                                    ? <img src={appt.pets.photo_url} className="w-10 h-10 rounded-xl object-cover shrink-0" alt="" />
                                    : <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-xl shrink-0">🐶</div>}
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-gray-900 text-sm">{appt.pets?.name ?? '—'} <span className="font-normal text-gray-400">· {appt.clients?.name?.split(' ')[0] ?? '—'}</span></p>
                                    <p className="text-xs text-gray-400">{serviceMap[appt.service] ?? appt.service} · {appt.appointment_time.replace(':00 ', ' ')}</p>
                                  </div>
                                  <div className="text-right shrink-0">
                                    {checkoutPayAmount[appt.id] ? <p className="text-sm font-bold text-gray-700">${checkoutPayAmount[appt.id]}</p> : <p className="text-xs text-gray-300">No amount</p>}
                                    <p className="text-[10px] text-amber-500 font-semibold">{isExpanded ? '▲ Close' : '▼ Record'}</p>
                                  </div>
                                </button>
                                {isExpanded && (
                                  <div className="px-4 pb-4 space-y-3 bg-gray-50 border-t border-gray-100">
                                    <div className="grid grid-cols-2 gap-3 pt-3">
                                      <div>
                                        <p className="text-xs text-gray-500 mb-1.5">Service Amount</p>
                                        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-2.5">
                                          <span className="text-gray-400">$</span>
                                          <input type="text" inputMode="numeric" pattern="[0-9]*"
                                            value={checkoutPayAmount[appt.id] ?? ''}
                                            onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setCheckoutPayAmount(prev => ({ ...prev, [appt.id]: v })) }}
                                            placeholder="0"
                                            className="flex-1 text-lg font-bold text-gray-800 focus:outline-none bg-transparent" />
                                        </div>
                                      </div>
                                      <div>
                                        <p className="text-xs text-gray-500 mb-1.5">Tip</p>
                                        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-2.5">
                                          <span className="text-gray-400">$</span>
                                          <input type="text" inputMode="numeric" pattern="[0-9]*"
                                            value={checkoutTipAmount[appt.id] ?? ''}
                                            onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setCheckoutTipAmount(prev => ({ ...prev, [appt.id]: v })) }}
                                            placeholder="0"
                                            className="flex-1 text-lg font-bold text-emerald-700 focus:outline-none bg-transparent" />
                                        </div>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-1.5">
                                      {['cash','card','venmo','zelle','check','other'].map(m => (
                                        <button key={m} onClick={() => setCheckoutPayMethod(prev => ({ ...prev, [appt.id]: m }))}
                                          className={`py-1.5 rounded-xl text-xs font-semibold border transition-colors ${(checkoutPayMethod[appt.id] ?? 'cash') === m ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                                          {methodIcons[m]} {m.charAt(0).toUpperCase() + m.slice(1)}
                                        </button>
                                      ))}
                                    </div>
                                    <button onClick={() => saveCheckoutPayment(appt.id)} disabled={savingCheckoutId === appt.id}
                                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl disabled:opacity-50">
                                      {savingCheckoutId === appt.id ? 'Saving…' : '💾 Save Payment'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}

                    {/* ── Paid transactions ── */}
                    {paidAppts.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-xs font-bold uppercase tracking-wider sticky top-0 z-10">
                          <span>✅ Paid Today</span>
                          <span className="bg-white/25 px-2 py-0.5 rounded-full">{paidAppts.length}</span>
                        </div>
                        <div className="bg-white divide-y divide-gray-100">
                          {paidAppts.map(appt => {
                            const method = appt.payment_method || 'other'
                            const tip = parseFloat(appt.tip_amount || '0')
                            const total = parseFloat(appt.payment_amount || '0') + tip
                            return (
                              <div key={appt.id} className="flex items-center gap-3 px-4 py-3">
                                {appt.pets?.photo_url
                                  ? <img src={appt.pets.photo_url} className="w-10 h-10 rounded-xl object-cover shrink-0" alt="" />
                                  : <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-lg shrink-0">🐾</div>}
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-gray-800 text-sm">{appt.pets?.name ?? '—'} <span className="font-normal text-gray-400">· {appt.clients?.name?.split(' ')[0] ?? '—'}</span></p>
                                  <p className="text-xs text-gray-400">{serviceMap[appt.service] ?? appt.service} · {appt.appointment_time.replace(':00 ', ' ')}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {appt.assigned_groomer && `✂️ ${appt.assigned_groomer.split(' ')[0]}`}
                                    {appt.assigned_groomer && appt.assigned_bather && ' · '}
                                    {appt.assigned_bather && `🛁 ${appt.assigned_bather.split(' ')[0]}`}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-black text-gray-800">${total.toFixed(0)}</p>
                                  {tip > 0 && <p className="text-[10px] text-emerald-500">${appt.payment_amount} + ${tip} tip</p>}
                                  <p className="text-[10px] text-gray-400 mt-0.5">{methodIcons[method]} {method}</p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        {/* Footer total */}
                        <div className="mx-4 mt-3 bg-gray-50 rounded-2xl px-4 py-3 flex justify-between items-center border border-gray-100">
                          <span className="text-sm text-gray-500 font-medium">{paidAppts.length} transactions</span>
                          <span className="text-base font-black text-gray-800">${totalAll.toFixed(2)} total</span>
                        </div>
                      </>
                    )}

                    {checkoutAppts.filter(a => a.status !== 'cancelled').length === 0 && (
                      <div className="text-center py-16">
                        <div className="text-5xl mb-3">📊</div>
                        <p className="text-gray-400 text-sm">No appointments today</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })()}

          {/* ── Customers Tab ── */}
          {tab === 'customers' && (
            <div className="max-w-2xl mx-auto p-4 space-y-3">
              {/* Search */}
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
              />

              {customersLoading ? (
                <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
              ) : customers.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-4xl mb-3">🐾</div>
                  <p className="text-gray-400 text-sm">No customers yet</p>
                </div>
              ) : (
                customers
                  .filter(c =>
                    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                    c.phone.includes(customerSearch)
                  )
                  .map(client => (
                    <div key={client.phone} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                      {/* Client header */}
                      <button
                        className="w-full p-4 flex items-center justify-between text-left"
                        onClick={() => setExpandedClient(expandedClient === client.phone ? null : client.phone)}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-800">{client.name}</p>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingClientPhone(client.phone); setEditingClientNameVal(client.name === client.phone ? '' : client.name) }}
                              className="text-xs text-sky-400 hover:text-sky-600"
                            >✏️</button>
                          </div>
                          <p className="text-sm text-gray-500">{client.phone}{client.email ? ` · ${client.email}` : ''}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {client.pets.length} pet{client.pets.length !== 1 ? 's' : ''} · {client.appointments.length} appt{client.appointments.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <span className="text-gray-400 text-lg">{expandedClient === client.phone ? '▲' : '▼'}</span>
                      </button>

                      {/* Expanded details */}
                      {expandedClient === client.phone && (
                        <div className="border-t border-gray-100 p-4 space-y-4">

                          {/* SMS Consent */}
                          <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">SMS Consent</p>
                              {client.sms_consent ? (
                                <p className="text-sm font-semibold text-emerald-700">✓ Opted in{client.sms_consent_at ? ` · ${new Date(client.sms_consent_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}` : ''}</p>
                              ) : (
                                <p className="text-sm font-semibold text-amber-700">⚠ Not opted in — no texts sent</p>
                              )}
                            </div>
                            {!client.sms_consent && (
                              <button
                                onClick={(e) => { e.stopPropagation(); grantSmsConsent(client.phone) }}
                                disabled={smsConsentSaving === client.phone}
                                className="text-xs font-semibold px-3 py-2 rounded-lg bg-sky-600 text-white disabled:opacity-50 flex-shrink-0"
                                title="Use only after the client has verbally confirmed they want to receive SMS notifications"
                              >
                                {smsConsentSaving === client.phone ? 'Saving…' : 'Mark opted-in'}
                              </button>
                            )}
                          </div>

                          {/* Pets */}
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pets</p>
                            <div className="space-y-3">
                              {client.pets.map(pet => (
                                <div key={pet.id} className="bg-gray-50 rounded-xl p-3 space-y-2">
                                  {/* Pet info header */}
                                  <div className="flex items-start gap-3">
                                    {/* Pet photo + upload */}
                                    <div className="shrink-0 flex flex-col items-center gap-1.5">
                                      {pet.photo_url ? (
                                        <img
                                          src={pet.photo_url}
                                          alt={pet.name}
                                          className="w-16 h-16 rounded-full object-cover border-2 border-sky-200"
                                        />
                                      ) : (
                                        <div className="w-16 h-16 rounded-full bg-sky-100 flex items-center justify-center text-3xl border-2 border-sky-200">
                                          🐶
                                        </div>
                                      )}
                                      <button
                                        onClick={() => {
                                          const input = document.createElement('input')
                                          input.type = 'file'
                                          input.accept = 'image/*'
                                          input.onchange = (e) => {
                                            const file = (e.target as HTMLInputElement).files?.[0]
                                            if (file) uploadPetPhoto(pet.id, file)
                                          }
                                          input.click()
                                        }}
                                        className="bg-sky-500 hover:bg-sky-600 text-white rounded-lg px-2 py-1 text-xs font-medium shadow transition-colors"
                                      >
                                        {uploadingPetId === pet.id ? '⏳ Uploading...' : '📷 Photo'}
                                      </button>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-gray-800 text-sm">{pet.name}</p>
                                      {(pet.breed || pet.weight) && <p className="text-xs text-gray-500">{[pet.breed, pet.weight].filter(Boolean).join(' · ')}</p>}
                                      {/* Vaccine status — tap badge to edit */}
                                      {editingVaccineId === pet.id ? (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {(['verified','email_sent','pending'] as const).map(s => (
                                            <button key={s}
                                              onClick={() => updateVaccineStatus(client.phone, pet.id, s)}
                                              disabled={savingVaccineId === pet.id}
                                              className={`text-xs px-2 py-0.5 rounded-full font-medium border transition-all disabled:opacity-50 ${
                                                pet.vaccine_status === s
                                                  ? s==='verified' ? 'bg-green-500 text-white border-green-500'
                                                    : s==='email_sent' ? 'bg-yellow-500 text-white border-yellow-500'
                                                    : 'bg-red-500 text-white border-red-500'
                                                  : 'bg-white text-gray-500 border-gray-200'
                                              }`}>
                                              {s==='verified'?'✓ Vaccinated':s==='email_sent'?'Records Pending':'No Records'}
                                            </button>
                                          ))}
                                          <button onClick={() => setEditingVaccineId(null)}
                                            className="text-xs text-gray-400 px-1">✕</button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => setEditingVaccineId(pet.id)}
                                          className={`text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 ${
                                            pet.vaccine_status === 'verified' ? 'bg-green-100 text-green-700' :
                                            pet.vaccine_status === 'email_sent' ? 'bg-yellow-100 text-yellow-700' :
                                            'bg-red-100 text-red-600'
                                          }`}>
                                          {pet.vaccine_status === 'verified' ? 'Vaccinated' :
                                           pet.vaccine_status === 'email_sent' ? 'Records Pending' : 'No Records'} ✏️
                                        </button>
                                      )}
                                      <div className="mt-1.5">
                                        <button
                                          onClick={() => { if (confirm(`Delete ${pet.name}'s profile? This cannot be undone.`)) deletePet(client.phone, pet.id) }}
                                          disabled={deletingPetId === pet.id}
                                          className="text-xs text-rose-400 hover:text-rose-600 font-medium disabled:opacity-50"
                                        >
                                          {deletingPetId === pet.id ? '⏳ Deleting…' : '🗑 Delete Pet'}
                                        </button>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Pet Notes Section — always visible */}
                                  <div className="border-t border-gray-200 pt-2">
                                    <div className="flex items-center justify-between mb-2">
                                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">📝 Pet Notes</p>
                                      <span className="text-xs text-gray-400 flex items-center gap-1">
                                        {translatingId === `pet_${pet.id}` && <span className="inline-block w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />}
                                        {translatingId === `pet_${pet.id}` ? 'Translating…' : noteTranslationsMap[`pet_${pet.id}`] ? '✓ Auto-translated' : 'Any language'}
                                      </span>
                                    </div>
                                    <div className="space-y-2">
                                      <textarea
                                        value={noteDrafts[`pet_${pet.id}`]?.chinese ?? (pet.notes_chinese || pet.notes_english || '')}
                                        onChange={e => {
                                          const val = e.target.value
                                          setNoteDrafts(prev => ({ ...prev, [`pet_${pet.id}`]: { ...prev[`pet_${pet.id}`] || {chinese:'',english:''}, chinese: val } }))
                                          triggerAutoTranslateMobile(`pet_${pet.id}`, val)
                                        }}
                                        placeholder="Type in English, 繁體中文, or 简体中文…"
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none bg-white"
                                        rows={2}
                                      />
                                      {noteTranslationsMap[`pet_${pet.id}`] && (() => {
                                        const t = noteTranslationsMap[`pet_${pet.id}`]
                                        return (
                                          <div className="bg-violet-50 rounded-xl p-2.5 space-y-1.5 border border-violet-100">
                                            {t.detected !== 'english' && t.english && (
                                              <div className="bg-white rounded-lg px-2.5 py-1.5 border border-violet-100">
                                                <p className="text-xs font-semibold text-gray-400">🇺🇸 English</p>
                                                <p className="text-xs text-gray-700">{t.english}</p>
                                              </div>
                                            )}
                                            {t.detected !== 'traditional' && t.traditional && (
                                              <div className="bg-white rounded-lg px-2.5 py-1.5 border border-violet-100">
                                                <p className="text-xs font-semibold text-gray-400">🇹🇼 繁體</p>
                                                <p className="text-xs text-gray-700">{t.traditional}</p>
                                              </div>
                                            )}
                                            {t.simplified && t.detected !== 'simplified' && (
                                              <div className="bg-white rounded-lg px-2.5 py-1.5 border border-violet-100">
                                                <p className="text-xs font-semibold text-gray-400">🇨🇳 简体</p>
                                                <p className="text-xs text-gray-700">{t.simplified}</p>
                                              </div>
                                            )}
                                          </div>
                                        )
                                      })()}
                                      <button
                                        onClick={() => saveNotes(`pet_${pet.id}`)}
                                        className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-1.5 rounded-lg text-xs transition-colors"
                                      >
                                        💾 Save Notes
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Appointment history */}
                          {client.appointments.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Appointment History</p>
                              <div className="space-y-1.5">
                                {client.appointments
                                  .sort((a, b) => b.appointment_date.localeCompare(a.appointment_date))
                                  .slice(0, 5)
                                  .map(appt => (
                                    <div key={appt.id} className="flex items-start justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                                      <div className="min-w-0">
                                        <span className="font-medium text-gray-700">
                                          {serviceMap[appt.service] ?? appt.service}
                                        </span>
                                        <span className="text-gray-400 ml-2">
                                          {new Date(appt.appointment_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                        {(appt.assigned_groomer || appt.assigned_bather) && (
                                          <p className="text-xs text-gray-400 mt-0.5">
                                            {appt.assigned_groomer && <span>✂️ {appt.assigned_groomer}</span>}
                                            {appt.assigned_groomer && appt.assigned_bather && <span className="mx-1">·</span>}
                                            {appt.assigned_bather && <span>🛁 {appt.assigned_bather}</span>}
                                          </p>
                                        )}
                                      </div>
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ml-2 ${
                                        appt.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
                                        appt.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                        appt.status === 'completed' ? 'bg-gray-100 text-gray-500' :
                                        'bg-red-100 text-red-600'
                                      }`}>
                                        {appt.status}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}

                          {/* Member since */}
                          <p className="text-xs text-gray-400">
                            Member since {new Date(client.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                          </p>
                        </div>
                      )}
                    </div>
                  ))
                )}
                <input ref={petPhotoRef} type="file" accept="image/*" className="hidden" />
            </div>
          )}

      </div>

      {/* ── Bottom Navigation Bar (groomer.io style) ── */}
      {(() => {
        const monthLabel = new Date().toLocaleDateString('en-US', { month: 'short' })
        const navItems = [
          { key: 'today',    svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, label: 'Today' },
          { key: 'pending',  svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="11" x2="11" y2="11"/></svg>, label: 'Requests' },
          { key: 'calendar', svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, label: monthLabel },
          { key: 'checkout', svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>, label: 'Check Out' },
          { key: 'customers', svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, label: 'Clients' },
          { key: 'settings', svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>, label: 'More' },
        ] as const
        return (
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 flex items-stretch" style={{paddingBottom: 'env(safe-area-inset-bottom)'}}>
            {navItems.map(({ key, svg, label }) => (
              <button
                key={key}
                onClick={() => setTab(key as typeof tab)}
                className={`flex-1 relative flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${
                  tab === key ? 'text-sky-600' : 'text-gray-400'
                }`}
              >
                {tab === key && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-sky-500 rounded-full" />}
                {svg}
                <span className="text-xs font-medium leading-none">{label}</span>
                {key === 'pending' && pendingCount > 0 && (
                  <span className="absolute top-1 right-2 bg-rose-500 text-white text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center">{pendingCount > 9 ? '9+' : pendingCount}</span>
                )}
              </button>
            ))}
          </div>
        )
      })()}
    </div>
  )
}
