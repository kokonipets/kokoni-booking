'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { tagClasses, type Tag } from '@/lib/tags'
import { readAuthRaw, saveAuth } from '@/lib/authStorage'

type StaffMember = {
  id: string
  name: string
  first_name?: string
  last_name?: string
  role: string
  email?: string
  username?: string
  phone?: string
  address?: string
  pay_type: 'hourly' | 'salary'
  hourly_rate?: number
  commission_percent: number
  tip_percent: number
  clock_pin?: string
  work_hours: Record<string, { start: string; end: string }>
  days_off: string[]
  special_hours?: Record<string, { start: string; end: string }>
  permissions: Record<string, boolean>
  username?: string
  email?: string
  password_hash?: string
  is_active: boolean
  created_at: string
}

type PriceTier = { label: string; price: string; duration: string }
type ServiceDef = { id: string; name: string; desc: string; price?: string; duration?: string; tiers: PriceTier[]; visible?: boolean; usesSizeCategories?: boolean }

const DEFAULT_TIERS: PriceTier[] = [
  { label: 'Small (under 15 lbs)', price: '45', duration: '1.5h' },
  { label: 'Medium (11-25 lbs)', price: '55', duration: '1.5h' },
  { label: 'Large (25-45 lbs)', price: '65', duration: '2h' },
  { label: 'XLarge (46-65 lbs)', price: '75', duration: '1.5h' },
]

const PERMISSION_OPTIONS = [
  { key: 'view_appointments', label: 'View Appointments' },
  { key: 'edit_appointments', label: 'Edit Appointments' },
  { key: 'view_revenue', label: 'View Revenue & Reports' },
  { key: 'manage_staff', label: 'Manage Staff' },
  { key: 'manage_services', label: 'Manage Services' },
  { key: 'view_clients', label: 'View Client Info' },
  { key: 'manage_schedule', label: 'Manage Schedule' },
]

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const CALENDAR_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Helper to generate calendar dates for a month
const getCalendarDates = (year: number, month: number) => {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDate = new Date(firstDay)
  startDate.setDate(startDate.getDate() - firstDay.getDay())

  const dates = []
  let current = new Date(startDate)

  while (current <= lastDay || current.getDay() !== 0) {
    dates.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }

  return dates
}

export default function SettingsPage() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null)
  const [showPasswordFor, setShowPasswordFor] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'staff' | 'business' | 'tags' | 'account' | 'coupons'>('staff')
  const [accountForm, setAccountForm] = useState({ username: '', currentPassword: '', newPassword: '', confirmPassword: '' })
  const [accountMsg, setAccountMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [savingAccount, setSavingAccount] = useState(false)
  const [tags, setTags] = useState<Tag[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('sky')
  const [savingTag, setSavingTag] = useState(false)
  const [formData, setFormData] = useState<Partial<StaffMember> & { password?: string }>({})
  const [showForm, setShowForm] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())
  const [selectedSpecialHourDate, setSelectedSpecialHourDate] = useState<string | null>(null)
  const [businessSettings, setBusinessSettings] = useState<Record<string, string>>({})
  const [storeHoursForm, setStoreHoursForm] = useState<Record<string, { open: string; close: string }>>({})
  const [savingMessage, setSavingMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [services, setServices] = useState<ServiceDef[]>([])
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [serviceFormData, setServiceFormData] = useState<ServiceDef>({ id: '', name: '', desc: '', tiers: DEFAULT_TIERS.map(t => ({...t})) })
  const [savingButton, setSavingButton] = useState<string | null>(null)
  const [closedDays, setClosedDays] = useState<Set<string>>(new Set())
  const [blockedHours, setBlockedHours] = useState<{ start: string; end: string }[]>([])
  const [selectedServiceTier, setSelectedServiceTier] = useState<Record<string, number>>({})
  const [slotInterval, setSlotInterval] = useState<15 | 30 | 45>(30)

  // ── Coupons state ─────────────────────────────────────────────────────────
  type Coupon = { id: string; name: string; code: string | null; discount_type: 'percent' | 'fixed'; discount_value: number; active: boolean; created_at: string }
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [couponForm, setCouponForm] = useState<{ name: string; code: string; discount_type: 'percent' | 'fixed'; discount_value: string }>({ name: '', code: '', discount_type: 'percent', discount_value: '' })
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null)
  const [savingCoupon, setSavingCoupon] = useState(false)
  const [couponMsg, setCouponMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadCoupons = async () => {
    try {
      const res = await fetch('/api/admin/coupons')
      const data = await res.json()
      setCoupons(data.coupons || [])
    } catch {}
  }

  useEffect(() => {
    loadStaff()
    loadBusinessSettings()
    loadTags()
    loadCoupons()
    // Pre-fill account form with current user's username
    try {
      const auth = JSON.parse(readAuthRaw('admin') || '{}')
      if (auth?.username) setAccountForm(prev => ({ ...prev, username: auth.username }))
    } catch {}
  }, [])

  const loadTags = async () => {
    try {
      const res = await fetch('/api/admin/tags')
      const data = await res.json()
      setTags(data.tags || [])
    } catch {}
  }

  // When businessSettings loads and form is open for new staff, update work_hours
  useEffect(() => {
    if (showForm && !editingId && businessSettings && Object.keys(businessSettings).length > 0) {
      // Update work hours if this is a new staff form
      const defaultHours = getDefaultWorkHours()
      if (Object.keys(defaultHours).length > 0) {
        setFormData(prev => ({
          ...prev,
          work_hours: defaultHours
        }))
      }
    }
  }, [businessSettings, showForm, editingId])

  const loadBusinessSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      const settings = data.settings || {}

      // Load services
      if (settings.services) {
        try {
          const parsed = JSON.parse(settings.services)
          if (Array.isArray(parsed)) {
            setServices(parsed as ServiceDef[])
          }
        } catch (e) {
          // Try to parse as simple text format and convert
          const lines = (settings.services as string).split('\n').filter((l: string) => l.trim())
          const converted = lines.map((line: string, idx: number) => ({
            id: `service_${idx}`,
            name: line.split('-')[0]?.trim() || 'Service',
            desc: '',
            tiers: DEFAULT_TIERS.map(t => ({...t}))
          }))
          setServices(converted)
        }
      }

      // Load closed days
      if (settings.closed_days) {
        const closedArray = (settings.closed_days as string).split(',').filter((d: string) => d.trim())
        setClosedDays(new Set(closedArray))
      }

      // Load slot interval
      if (settings.appointment_interval) {
        const iv = parseInt(settings.appointment_interval)
        if (iv === 15 || iv === 30 || iv === 45) setSlotInterval(iv)
      }

      // Load blocked hours — DB may store 12h ("11:00 AM"), 24h ("11:00"), or corrupted ("11:NaN AM")
      // Convert everything to clean 24h "HH:MM" for <input type="time">, discard invalid entries
      if (settings.blocked_hours) {
        try {
          const bh = JSON.parse(settings.blocked_hours)
          if (Array.isArray(bh)) {
            const to24 = (t: string): string | null => {
              if (!t || typeof t !== 'string') return null
              const clean = t.toUpperCase().trim()
              // Detect 12h format
              if (clean.includes('AM') || clean.includes('PM')) {
                const [timePart, meridiem] = clean.split(' ')
                const [hStr, mStr] = timePart.split(':')
                const h = parseInt(hStr)
                const m = parseInt(mStr || '0')
                if (isNaN(h) || isNaN(m)) return null  // corrupted — discard
                let h24 = h
                if (meridiem === 'PM' && h !== 12) h24 = h + 12
                if (meridiem === 'AM' && h === 12) h24 = 0
                return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
              }
              // Already 24h — validate
              const [hStr, mStr] = clean.split(':')
              const h = parseInt(hStr), m = parseInt(mStr || '0')
              if (isNaN(h) || isNaN(m)) return null  // corrupted — discard
              return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
            }
            const cleaned = bh
              .map((b: { start: string; end: string }) => ({ start: to24(b.start), end: to24(b.end) }))
              .filter((b: { start: string | null; end: string | null }) => b.start !== null && b.end !== null)
            setBlockedHours(cleaned as { start: string; end: string }[])
          }
        } catch { setBlockedHours([]) }
      }

      setBusinessSettings(settings)
    } catch (err) {
      console.error(err)
    }
  }

  const loadStaff = async () => {
    try {
      const res = await fetch('/api/admin/staff', { cache: 'no-store' })
      if (!res.ok) {
        throw new Error(`Failed to load staff: ${res.statusText}`)
      }
      const data = await res.json()
      setStaff(data.staff || [])
    } catch (err) {
      console.error('Error loading staff:', err)
      setSavingMessage({ type: 'error', text: `❌ Error loading staff: ${err instanceof Error ? err.message : 'Unknown error'}` })
    } finally {
      setLoading(false)
    }
  }

  // Get default work hours from store hours
  const getDefaultWorkHours = (): Record<string, { start: string; end: string }> => {
    const workHours: Record<string, { start: string; end: string }> = {}
    DAYS.forEach(day => {
      // Skip closed days
      if (closedDays.has(day)) {
        return
      }
      const openKey = `hours_${day}_open`
      const closeKey = `hours_${day}_close`
      // Always get the latest businessSettings value
      const openTime = businessSettings[openKey] as string
      const closeTime = businessSettings[closeKey] as string
      workHours[day] = {
        start: openTime || '09:00',
        end: closeTime || '18:00'
      }
    })
    return workHours
  }

  const handleSave = async () => {
    // Validation
    if (!formData.first_name?.trim()) {
      setSavingMessage({ type: 'error', text: '❌ First name is required' })
      setTimeout(() => setSavingMessage(null), 5000)
      return
    }

    if (!editingId) {
      // New staff - require username and password
      if (!formData.username?.trim()) {
        setSavingMessage({ type: 'error', text: '❌ Username is required' })
        setTimeout(() => setSavingMessage(null), 5000)
        return
      }
      if (!formData.password?.trim()) {
        setSavingMessage({ type: 'error', text: '❌ Password is required' })
        setTimeout(() => setSavingMessage(null), 5000)
        return
      }
    }

    setSavingButton('staff')
    try {
      if (editingId) {
        // Update
        const res = await fetch(`/api/admin/staff/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: formData.first_name,
            last_name: formData.last_name,
            name: `${formData.first_name || ''} ${formData.last_name || ''}`.trim(),
            role: formData.role,
            username: formData.username,
            email: formData.email,
            password: formData.password,
            phone: formData.phone,
            address: formData.address,
            pay_type: formData.pay_type || 'hourly',
            hourly_rate: typeof formData.hourly_rate === 'number' ? formData.hourly_rate : null,
            commission_percent: typeof formData.commission_percent === 'number' ? formData.commission_percent : 0,
            tip_percent: typeof formData.tip_percent === 'number' ? formData.tip_percent : 0,
            clock_pin: formData.clock_pin ?? null,
            work_hours: formData.work_hours,
            days_off: formData.days_off,
            special_hours: formData.special_hours,
            permissions: formData.permissions,
          }),
        })
        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.error || `Failed to update staff: ${res.statusText}`)
        }
        // Optimistic update — reflect changes immediately in the UI
        setStaff(prev => prev.map(s => s.id === editingId ? {
          ...s,
          first_name: formData.first_name,
          last_name: formData.last_name,
          name: `${formData.first_name || ''} ${formData.last_name || ''}`.trim(),
          username: formData.username || s.username,
          email: formData.email || s.email,
          role: formData.role || s.role,
        } : s))
        await loadStaff()
        setEditingId(null)
        setSavingButton('staff_done')
        setTimeout(() => { setSavingButton(null); setSavingMessage(null) }, 2000)
        setSavingMessage({ type: 'success', text: '✅ Staff updated!' })
      } else {
        // Create
        const res = await fetch('/api/admin/staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: formData.first_name,
            last_name: formData.last_name,
            name: `${formData.first_name || ''} ${formData.last_name || ''}`.trim(),
            role: formData.role,
            username: formData.username,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            password: formData.password,
            pay_type: formData.pay_type || 'hourly',
            hourly_rate: typeof formData.hourly_rate === 'number' ? formData.hourly_rate : null,
            commission_percent: typeof formData.commission_percent === 'number' ? formData.commission_percent : 0,
            tip_percent: typeof formData.tip_percent === 'number' ? formData.tip_percent : 0,
            clock_pin: formData.clock_pin ?? null,
            work_hours: formData.work_hours || {},
            days_off: formData.days_off || [],
            special_hours: formData.special_hours || {},
          }),
        })
        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.error || `Failed to create staff: ${res.statusText}`)
        }
        await loadStaff()
        setSavingButton('staff_done')
        setTimeout(() => { setSavingButton(null); setSavingMessage(null) }, 2000)
        setSavingMessage({ type: 'success', text: '✅ Staff created!' })
      }
      setFormData({})
      setShowForm(false)
    } catch (err) {
      setSavingButton(null)
      setSavingMessage({ type: 'error', text: `❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}` })
      setTimeout(() => setSavingMessage(null), 5000)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this staff member? This action cannot be undone.')) return
    setSavingButton('delete_' + id)
    try {
      const res = await fetch(`/api/admin/staff/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || `Failed to delete staff: ${res.statusText}`)
      }
      await loadStaff()
      setSavingButton('delete_done_' + id)
      setTimeout(() => { setSavingButton(null); setSavingMessage(null) }, 2000)
      setSavingMessage({ type: 'success', text: '✅ Staff member deleted!' })
    } catch (err) {
      setSavingButton(null)
      setSavingMessage({ type: 'error', text: `❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}` })
      setTimeout(() => setSavingMessage(null), 5000)
    }
  }

  const handleEdit = (member: StaffMember) => {
    setFormData({
      ...member,
      username: member.username || '',
      email: member.email || '',
      password: '',
    })
    setEditingId(member.id)
    setShowForm(true)
  }

  const togglePermission = (key: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...(prev.permissions || {}),
        [key]: !(prev.permissions?.[key] ?? false)
      }
    }))
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <Link href="/admin/desk" className="text-gray-400 hover:text-gray-600">
            ← Back
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-6">
        <div className="flex gap-8">
          {(['staff', 'business', 'tags', 'coupons', 'account'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'border-sky-500 text-sky-700'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab === 'staff' ? '👥 Staff' : tab === 'business' ? '🏪 Business Settings' : tab === 'tags' ? '🏷️ Tags' : tab === 'coupons' ? '🎟️ Coupons' : '🔑 My Account'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Message Display */}
        {savingMessage && (
          <div className={`mb-4 p-3 rounded-lg text-sm font-semibold ${
            savingMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {savingMessage.text}
          </div>
        )}

        {activeTab === 'staff' && (
          <div className="space-y-4">
            {/* Add Staff Button */}
            {!showForm && (
              <button
                onClick={() => {
                  setShowForm(true)
                  setEditingId(null)
                  setFormData({
                    work_hours: getDefaultWorkHours(),
                    commission_percent: undefined,
                    tip_percent: undefined
                  })
                }}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                + Add Staff Member
              </button>
            )}

            {/* Staff Form */}
            {showForm && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
                <h2 className="text-lg font-bold text-gray-800">{editingId ? 'Edit Staff' : 'New Staff Member'}</h2>

                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="First Name"
                    value={formData.first_name || ''}
                    onChange={e => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Last Name"
                    value={formData.last_name || ''}
                    onChange={e => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                  <select
                    value={formData.role || 'groomer'}
                    onChange={e => setFormData(prev => ({ ...prev, role: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="bather">Bather</option>
                    <option value="assistant_groomer">Assistant Groomer (AG)</option>
                    <option value="groomer">Groomer</option>
                    <option value="head_groomer">Head Groomer</option>
                    <option value="admin">Admin / Owner</option>
                  </select>
                </div>

                {/* Login & Contact Info */}
                <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs font-semibold text-blue-700">🔐 Login & Contact Info</p>
                  {!editingId ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <input
                          type="text"
                          placeholder="Username (for login)"
                          value={formData.username || ''}
                          onChange={e => setFormData(prev => ({ ...prev, username: e.target.value }))}
                          className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                        />
                        <input
                          type="password"
                          placeholder="Password"
                          value={formData.password || ''}
                          onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
                          className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                        />
                      </div>
                      <input
                        type="email"
                        placeholder="Email (for payroll)"
                        value={formData.email || ''}
                        onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full"
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <input
                          type="text"
                          placeholder="Username (for login)"
                          value={formData.username || ''}
                          onChange={e => setFormData(prev => ({ ...prev, username: e.target.value }))}
                          className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                        />
                        <input
                          type="password"
                          placeholder="New password (leave blank to keep)"
                          value={formData.password || ''}
                          onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
                          className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                        />
                      </div>
                      <input
                        type="email"
                        placeholder="Email (for payroll)"
                        value={formData.email || ''}
                        onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-full"
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="tel"
                      placeholder="Phone (optional)"
                      value={formData.phone || ''}
                      onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Address (optional)"
                      value={formData.address || ''}
                      onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                {/* Pay Type */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Pay Type</label>
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, pay_type: 'hourly' }))}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                        (formData.pay_type || 'hourly') === 'hourly'
                          ? 'bg-sky-600 text-white border-sky-600'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      Hourly
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, pay_type: 'salary' }))}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                        formData.pay_type === 'salary'
                          ? 'bg-sky-600 text-white border-sky-600'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      Salary
                    </button>
                  </div>
                  {(formData.pay_type || 'hourly') === 'hourly' && (
                    <div className="flex items-center border border-gray-200 rounded-xl px-3 py-2">
                      <span className="text-xs text-gray-400 mr-1">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.50"
                        placeholder="Hourly rate"
                        value={formData.hourly_rate ?? ''}
                        onChange={e => {
                          const val = e.target.value.trim()
                          setFormData(prev => ({
                            ...prev,
                            hourly_rate: val === '' ? undefined : parseFloat(val)
                          }))
                        }}
                        onFocus={(e) => {
                          setTimeout(() => e.currentTarget.select(), 0)
                        }}
                        className="flex-1 text-sm focus:outline-none"
                      />
                      <span className="text-xs text-gray-400 ml-1">/ hr</span>
                    </div>
                  )}
                  {formData.pay_type === 'salary' && (
                    <div className="flex items-center border border-gray-200 rounded-xl px-3 py-2">
                      <span className="text-xs text-gray-400 mr-1">$</span>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        placeholder="Annual salary"
                        value={formData.hourly_rate ?? ''}
                        onChange={e => {
                          const val = e.target.value.trim()
                          setFormData(prev => ({
                            ...prev,
                            hourly_rate: val === '' ? undefined : parseFloat(val)
                          }))
                        }}
                        onFocus={(e) => {
                          setTimeout(() => e.currentTarget.select(), 0)
                        }}
                        className="flex-1 text-sm focus:outline-none"
                      />
                      <span className="text-xs text-gray-400 ml-1">/ yr</span>
                    </div>
                  )}
                </div>

                {/* Commission & Tips */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Commission %</label>
                    <div className="flex items-center border border-gray-200 rounded-xl px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        placeholder="Enter % (optional)"
                        value={formData.commission_percent ?? ''}
                        onChange={e => {
                          const val = e.target.value.trim()
                          setFormData(prev => ({
                            ...prev,
                            commission_percent: val === '' ? undefined : parseFloat(val)
                          }))
                        }}
                        onFocus={(e) => {
                          setTimeout(() => e.currentTarget.select(), 0)
                        }}
                        className="flex-1 text-sm focus:outline-none"
                      />
                      <span className="text-xs text-gray-400 ml-1">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Tip %</label>
                    <div className="flex items-center border border-gray-200 rounded-xl px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        placeholder="Enter % (optional)"
                        value={formData.tip_percent ?? ''}
                        onChange={e => {
                          const val = e.target.value.trim()
                          setFormData(prev => ({
                            ...prev,
                            tip_percent: val === '' ? undefined : parseFloat(val)
                          }))
                        }}
                        onFocus={(e) => {
                          setTimeout(() => e.currentTarget.select(), 0)
                        }}
                        className="flex-1 text-sm focus:outline-none"
                      />
                      <span className="text-xs text-gray-400 ml-1">%</span>
                    </div>
                  </div>
                </div>

                {/* Clock-in PIN */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Clock-In PIN</label>
                  <div className="flex items-center border border-gray-200 rounded-xl px-3 py-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={8}
                      placeholder="4-digit PIN for /clock kiosk"
                      value={formData.clock_pin ?? ''}
                      onChange={e => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
                        setFormData(prev => ({ ...prev, clock_pin: digits }))
                      }}
                      className="flex-1 text-sm focus:outline-none tracking-widest"
                    />
                    <span className="text-[10px] text-gray-400 ml-1">unique</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Staff enters this on the <code>/clock</code> kiosk to clock in/out.</p>
                </div>

                {/* Work Hours */}
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">📅 Work Hours</p>
                  <div className="space-y-2">
                    {DAYS.map(day => {
                      const isClosed = closedDays.has(day)
                      return (
                        <div key={day} className={`flex items-center gap-2 p-2 rounded ${isClosed ? 'bg-red-50' : ''}`}>
                          <label className="text-xs text-gray-600 w-20">{day}</label>
                          {isClosed ? (
                            <span className="text-xs font-semibold text-red-600">🔴 Closed</span>
                          ) : (
                            <>
                              <input
                                type="time"
                                value={formData.work_hours?.[day]?.start || '09:00'}
                                onChange={e => setFormData(prev => ({
                                  ...prev,
                                  work_hours: {
                                    ...(prev.work_hours || {}),
                                    [day]: { ...(prev.work_hours?.[day] || {}), start: e.target.value }
                                  }
                                }))}
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1"
                              />
                              <span className="text-xs text-gray-400">-</span>
                              <input
                                type="time"
                                value={formData.work_hours?.[day]?.end || '18:00'}
                                onChange={e => setFormData(prev => ({
                                  ...prev,
                                  work_hours: {
                                    ...(prev.work_hours || {}),
                                    [day]: { ...(prev.work_hours?.[day] || {}), end: e.target.value }
                                  }
                                }))}
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1"
                              />
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Unified Schedule Calendar */}
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-3">📆 Schedule & Special Days (Click to set)</p>

                  {/* Calendar */}
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    {/* Month Navigation */}
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => {
                          if (calendarMonth === 0) {
                            setCalendarYear(calendarYear - 1)
                            setCalendarMonth(11)
                          } else {
                            setCalendarMonth(calendarMonth - 1)
                          }
                        }}
                        className="text-xs font-semibold text-sky-600 hover:bg-sky-50 px-2 py-1 rounded"
                      >
                        ←
                      </button>
                      <span className="text-sm font-bold text-gray-700">
                        {new Date(calendarYear, calendarMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </span>
                      <button
                        onClick={() => {
                          if (calendarMonth === 11) {
                            setCalendarYear(calendarYear + 1)
                            setCalendarMonth(0)
                          } else {
                            setCalendarMonth(calendarMonth + 1)
                          }
                        }}
                        className="text-xs font-semibold text-sky-600 hover:bg-sky-50 px-2 py-1 rounded"
                      >
                        →
                      </button>
                    </div>

                    {/* Day headers */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                      {CALENDAR_DAYS.map(day => (
                        <div key={day} className="text-center text-xs font-semibold text-gray-500 py-1">
                          {day}
                        </div>
                      ))}
                    </div>

                    {/* Calendar grid */}
                    <div className="grid grid-cols-7 gap-1">
                      {getCalendarDates(calendarYear, calendarMonth).map(date => {
                        const dateStr = date.toISOString().split('T')[0]
                        const isDayOff = formData.days_off?.includes(dateStr)
                        const hasSpecialHours = formData.special_hours?.[dateStr]
                        const isCurrentMonth = date.getMonth() === calendarMonth
                        const isToday = dateStr === new Date().toISOString().split('T')[0]
                        const isPast = date < new Date() && !isToday
                        // Check if the store is closed on this day of the week
                        const dayName = DAYS[date.getDay() === 0 ? 6 : date.getDay() - 1]
                        const isStoreClosed = closedDays.has(dayName)

                        return (
                          <button
                            key={dateStr}
                            onClick={() => {
                              if (!isPast && !isStoreClosed) {
                                setSelectedSpecialHourDate(dateStr)
                              }
                            }}
                            disabled={isPast || isStoreClosed}
                            title={isStoreClosed ? 'Store Closed' : isDayOff ? 'Day Off' : hasSpecialHours ? `Special Hours: ${hasSpecialHours.start} - ${hasSpecialHours.end}` : 'Click to set'}
                            className={`text-xs py-2 rounded border transition-colors cursor-pointer hover:shadow-sm ${
                              isStoreClosed ? 'bg-gray-300 text-gray-600 border-gray-400 cursor-not-allowed font-semibold' :
                              isPast ? 'bg-gray-100 text-gray-300 cursor-not-allowed' :
                              isDayOff ? 'bg-red-500 text-white border-red-500 font-semibold' :
                              hasSpecialHours ? 'bg-orange-400 text-white border-orange-500 font-semibold' :
                              isToday ? 'bg-sky-100 text-sky-700 border-sky-300 font-semibold' :
                              isCurrentMonth ? 'bg-white text-gray-700 border-gray-200 hover:border-sky-300' :
                              'bg-gray-50 text-gray-400 border-gray-100'
                            }`}
                          >
                            {date.getDate()}
                          </button>
                        )
                      })}
                    </div>

                    {/* Legend */}
                    <div className="flex gap-4 text-xs mt-4 pt-3 border-t border-gray-200 flex-wrap">
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 bg-sky-100 border border-sky-300 rounded"></div>
                        <span className="text-gray-600">Today</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 bg-gray-300 border border-gray-400 rounded"></div>
                        <span className="text-gray-600">Store Closed</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 bg-red-500 rounded"></div>
                        <span className="text-gray-600">Day Off</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 bg-orange-400 rounded"></div>
                        <span className="text-gray-600">Special Hours</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 bg-white border border-gray-300 rounded"></div>
                        <span className="text-gray-600">Working</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Dialog - appears when date is clicked */}
                  {selectedSpecialHourDate && (() => {
                    const dateObj = new Date(selectedSpecialHourDate + 'T12:00:00')
                    const isDayOff = formData.days_off?.includes(selectedSpecialHourDate)
                    const dayName = DAYS[dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1]
                    const storeHourOpen = businessSettings[`hours_${dayName}_open`] || '09:00'
                    const storeHourClose = businessSettings[`hours_${dayName}_close`] || '18:00'

                    return (
                      <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-gray-800">
                            {dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', weekday: 'long' })}
                          </p>
                          <button
                            onClick={() => setSelectedSpecialHourDate(null)}
                            className="text-gray-400 hover:text-gray-600 text-xl font-bold"
                          >
                            ×
                          </button>
                        </div>

                        <div className="space-y-2">
                          {/* Option 1: Working Day */}
                          <button
                            onClick={() => {
                              setFormData(prev => ({
                                ...prev,
                                days_off: prev.days_off?.filter(d => d !== selectedSpecialHourDate) || [],
                              }))
                              setSelectedSpecialHourDate(null)
                            }}
                            className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                              !isDayOff
                                ? 'border-sky-500 bg-sky-50'
                                : 'border-gray-200 hover:border-gray-300 bg-white'
                            }`}
                          >
                            <p className="text-xs font-bold text-gray-800">✓ Working Day</p>
                            <p className="text-xs text-gray-600 mt-1">Regular schedule: {storeHourOpen} - {storeHourClose}</p>
                          </button>

                          {/* Option 2: Day Off */}
                          <button
                            onClick={() => {
                              setFormData(prev => ({
                                ...prev,
                                days_off: isDayOff
                                  ? prev.days_off?.filter(d => d !== selectedSpecialHourDate) || []
                                  : [...(prev.days_off || []), selectedSpecialHourDate].sort(),
                              }))
                              setSelectedSpecialHourDate(null)
                            }}
                            className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                              isDayOff
                                ? 'border-red-500 bg-red-50'
                                : 'border-gray-200 hover:border-gray-300 bg-white'
                            }`}
                          >
                            <p className="text-xs font-bold text-gray-800">✗ Day Off</p>
                            <p className="text-xs text-gray-600 mt-1">Not scheduled</p>
                          </button>

                          {/* Option 3: Special Hours */}
                          {!isDayOff && (
                            <>
                              <button
                                onClick={() => setSelectedSpecialHourDate(selectedSpecialHourDate + '_editing')}
                                className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                                  formData.special_hours?.[selectedSpecialHourDate]
                                    ? 'border-orange-500 bg-orange-50'
                                    : 'border-gray-200 hover:border-gray-300 bg-white'
                                }`}
                              >
                                <p className="text-xs font-bold text-gray-800">⏰ Special Hours</p>
                                {formData.special_hours?.[selectedSpecialHourDate] ? (
                                  <p className="text-xs text-gray-600 mt-1">
                                    {formData.special_hours[selectedSpecialHourDate].start} - {formData.special_hours[selectedSpecialHourDate].end}
                                  </p>
                                ) : (
                                  <p className="text-xs text-gray-600 mt-1">Set custom hours for this day</p>
                                )}
                              </button>

                              {/* Special Hours Editor */}
                              {selectedSpecialHourDate.endsWith('_editing') && (
                                <div className="p-3 bg-orange-50 rounded-lg border border-orange-200 space-y-2">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-xs font-semibold text-gray-600">Start Time</label>
                                      <input
                                        type="time"
                                        value={formData.special_hours?.[selectedSpecialHourDate.replace('_editing', '')]?.start || '09:00'}
                                        onChange={e => setFormData(prev => ({
                                          ...prev,
                                          special_hours: {
                                            ...(prev.special_hours || {}),
                                            [selectedSpecialHourDate.replace('_editing', '')]: {
                                              ...(prev.special_hours?.[selectedSpecialHourDate.replace('_editing', '')] || {}),
                                              start: e.target.value
                                            }
                                          }
                                        }))}
                                        className="w-full text-xs border border-gray-200 rounded px-2 py-1"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs font-semibold text-gray-600">End Time</label>
                                      <input
                                        type="time"
                                        value={formData.special_hours?.[selectedSpecialHourDate.replace('_editing', '')]?.end || '18:00'}
                                        onChange={e => setFormData(prev => ({
                                          ...prev,
                                          special_hours: {
                                            ...(prev.special_hours || {}),
                                            [selectedSpecialHourDate.replace('_editing', '')]: {
                                              ...(prev.special_hours?.[selectedSpecialHourDate.replace('_editing', '')] || {}),
                                              end: e.target.value
                                            }
                                          }
                                        }))}
                                        className="w-full text-xs border border-gray-200 rounded px-2 py-1"
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        <button
                          onClick={() => setSelectedSpecialHourDate(null)}
                          className="w-full px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-lg transition-colors"
                        >
                          Done
                        </button>
                      </div>
                    )
                  })()}

                  {/* Summary View */}
                  {formData.days_off?.length ? (
                    <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-red-700 mb-2">📍 Days Off ({formData.days_off.length}):</p>
                      <div className="flex flex-wrap gap-2">
                        {formData.days_off.map(date => (
                          <span key={date} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded font-medium">
                            {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {formData.special_hours && Object.keys(formData.special_hours).length > 0 ? (
                    <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-orange-700 mb-2">⏰ Special Hours ({Object.keys(formData.special_hours).length}):</p>
                      <div className="space-y-1">
                        {Object.entries(formData.special_hours).sort().map(([date, hours]) => (
                          <div key={date} className="flex items-center justify-between text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded font-medium">
                            <span>{new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            <span>{hours.start} - {hours.end}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Permissions */}
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">🔐 Permissions</p>
                  <div className="grid grid-cols-2 gap-2">
                    {PERMISSION_OPTIONS.map(perm => (
                      <label key={perm.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.permissions?.[perm.key] ?? false}
                          onChange={() => togglePermission(perm.key)}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                        <span className="text-xs text-gray-700">{perm.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={savingButton === 'staff'}
                    className="flex-1 px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-75"
                  >
                    {savingButton === 'staff' ? '⏳ Saving...' : savingButton === 'staff_done' ? '✅ Done!' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setShowForm(false); setFormData({}) }}
                    disabled={savingButton === 'staff'}
                    className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Staff List */}
            {!showForm && (
              <div className="space-y-2">
                {loading ? (
                  <p className="text-gray-400">Loading staff...</p>
                ) : staff.length === 0 ? (
                  <p className="text-gray-400">No staff members yet</p>
                ) : (
                  staff.map(member => {
                    const isExpanded = expandedStaffId === member.id
                    const displayName = member.first_name || member.last_name
                      ? `${member.first_name || ''} ${member.last_name || ''}`.trim()
                      : member.name
                    const decodedPassword = member.password_hash
                      ? Buffer.from(member.password_hash, 'base64').toString('utf-8')
                      : null

                    return (
                      <div key={member.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                        {/* Collapsed row — click to expand */}
                        <div
                          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                          onClick={() => setExpandedStaffId(isExpanded ? null : member.id)}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                            <div>
                              <p className="font-semibold text-gray-800">{displayName}</p>
                              <p className="text-xs text-gray-400 capitalize">{member.role.replace('_', ' ')}</p>
                            </div>
                          </div>
                          <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                            <button onClick={() => handleEdit(member)}
                              className="text-xs font-semibold text-sky-600 hover:bg-sky-100 px-3 py-1 rounded-lg">
                              ✏️ Edit
                            </button>
                            <button onClick={() => handleDelete(member.id)}
                              disabled={savingButton === 'delete_' + member.id}
                              className="text-xs font-semibold text-red-600 hover:bg-red-100 px-3 py-1 rounded-lg disabled:opacity-50">
                              {savingButton === 'delete_' + member.id ? '⏳...' : '🗑️'}
                            </button>
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="border-t border-gray-100 p-4 space-y-3">
                            {/* Login Info */}
                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                              <p className="text-xs font-bold text-blue-900 mb-2">🔐 Login Info</p>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-gray-600 font-semibold">Username:</span>
                                  <p className="text-gray-800 font-mono">{member.username || '-'}</p>
                                </div>
                                <div>
                                  <span className="text-gray-600 font-semibold">Email:</span>
                                  <p className="text-gray-800 font-mono">{member.email || '-'}</p>
                                </div>
                                <div className="col-span-2">
                                  <span className="text-gray-600 font-semibold">Password:</span>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <p className="text-gray-800 font-mono">
                                      {decodedPassword
                                        ? showPasswordFor === member.id ? decodedPassword : '••••••••'
                                        : '-'}
                                    </p>
                                    {decodedPassword && (
                                      <button
                                        onClick={() => setShowPasswordFor(showPasswordFor === member.id ? null : member.id)}
                                        className="text-xs text-blue-500 hover:text-blue-700">
                                        {showPasswordFor === member.id ? 'Hide' : 'Show'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Contact Info */}
                            <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                              <p className="text-xs font-bold text-amber-900 mb-2">📞 Contact Info</p>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-gray-600 font-semibold">Phone:</span>
                                  <p className="text-gray-800">{member.phone || '-'}</p>
                                </div>
                                <div>
                                  <span className="text-gray-600 font-semibold">Address:</span>
                                  <p className="text-gray-800">{member.address || '-'}</p>
                                </div>
                              </div>
                            </div>

                            {/* Earnings */}
                            <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                              <p className="text-xs font-bold text-emerald-900 mb-2">💰 Earnings</p>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <span className="text-gray-600 font-semibold">Pay:</span>
                                  <p className="text-gray-800">
                                    {(member.pay_type || 'hourly') === 'hourly'
                                      ? `$${member.hourly_rate ?? 0}/hr`
                                      : `$${(member.hourly_rate ?? 0).toLocaleString()}/yr`
                                    }
                                  </p>
                                </div>
                                <div>
                                  <span className="text-gray-600 font-semibold">Commission:</span>
                                  <p className="text-gray-800">{member.commission_percent}%</p>
                                </div>
                                <div>
                                  <span className="text-gray-600 font-semibold">Tips:</span>
                                  <p className="text-gray-800">{member.tip_percent}%</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )}


        {activeTab === 'business' && (
          <div className="space-y-6">
            {/* Store Hours Section */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">🕐 Store Hours</h2>
              <div className="space-y-3">
                {DAYS.map(day => {
                  const isClosed = closedDays.has(day)
                  return (
                    <div key={day} className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${isClosed ? 'bg-red-50' : 'bg-white'}`}>
                      <label className="text-sm font-semibold text-gray-600 w-24">{day}</label>
                      <input
                        type="checkbox"
                        checked={isClosed}
                        onChange={e => {
                          const newClosed = new Set(closedDays)
                          if (e.target.checked) {
                            newClosed.add(day)
                            setBusinessSettings(prev => {
                              const updated = { ...prev }
                              delete updated[`hours_${day}_open`]
                              delete updated[`hours_${day}_close`]
                              return updated
                            })
                          } else {
                            newClosed.delete(day)
                            // Add default times when opening day
                            setBusinessSettings(prev => ({
                              ...prev,
                              [`hours_${day}_open`]: prev[`hours_${day}_open`] || '09:00',
                              [`hours_${day}_close`]: prev[`hours_${day}_close`] || '18:00'
                            }))
                          }
                          setClosedDays(newClosed)
                        }}
                        className="w-5 h-5 rounded border-gray-300"
                      />
                      <span className="text-xs font-semibold text-gray-600 w-12">{isClosed ? '🔴 Closed' : '🟢 Open'}</span>

                      {!isClosed && (
                        <>
                          <input
                            type="time"
                            placeholder="Open"
                            value={businessSettings[`hours_${day}_open`] || '09:00'}
                            onChange={e => setBusinessSettings(prev => ({ ...prev, [`hours_${day}_open`]: e.target.value }))}
                            className="text-sm border border-gray-200 rounded-lg px-2 py-1"
                          />
                          <span className="text-gray-400">-</span>
                          <input
                            type="time"
                            placeholder="Close"
                            value={businessSettings[`hours_${day}_close`] || '18:00'}
                            onChange={e => setBusinessSettings(prev => ({ ...prev, [`hours_${day}_close`]: e.target.value }))}
                            className="text-sm border border-gray-200 rounded-lg px-2 py-1"
                          />
                        </>
                      )}
                    </div>
                  )
                })}
                {/* Appointment time slot interval */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm font-semibold text-gray-700 mb-2">⏱ Booking Time Slot Interval</p>
                  <p className="text-xs text-gray-400 mb-3">How far apart appointment slots appear on the booking page</p>
                  <div className="flex gap-2">
                    {([15, 30, 45] as const).map(iv => (
                      <button
                        key={iv}
                        onClick={() => setSlotInterval(iv)}
                        className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                          slotInterval === iv
                            ? 'bg-sky-600 text-white border-sky-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-sky-300'
                        }`}
                      >
                        {iv} min
                      </button>
                    ))}
                  </div>
                </div>

                {/* Blocked Hours */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-700">🚫 Blocked Time Periods</p>
                      <p className="text-xs text-gray-400 mt-0.5">No bookings during these hours (e.g. lunch break). Applied every open day.</p>
                    </div>
                    <button
                      onClick={() => setBlockedHours(prev => [...prev, { start: '12:00', end: '13:00' }])}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1"
                    >
                      + Add Block
                    </button>
                  </div>
                  {/* DB status — shows what's actually saved */}
                  {businessSettings['blocked_hours'] && (
                    <p className="text-xs text-gray-400 mb-2">
                      💾 DB: {(() => {
                        try {
                          const bh = JSON.parse(businessSettings['blocked_hours'])
                          if (!Array.isArray(bh) || bh.length === 0) return 'empty'
                          return bh.map((b: {start:string;end:string}) => `${b.start}–${b.end}`).join(', ')
                        } catch { return 'invalid' }
                      })()}
                    </p>
                  )}
                  {blockedHours.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-2">No blocked periods. All hours within open/close times are bookable.</p>
                  ) : (
                    <div className="space-y-2">
                      {blockedHours.map((block, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2">
                          <span className="text-xs font-semibold text-orange-600 w-16 shrink-0">Block {idx + 1}</span>
                          <input
                            type="time"
                            value={block.start}
                            onChange={e => {
                              const updated = [...blockedHours]
                              updated[idx] = { ...updated[idx], start: e.target.value }
                              setBlockedHours(updated)
                            }}
                            className="text-sm border border-orange-200 rounded-lg px-2 py-1 bg-white"
                          />
                          <span className="text-gray-400 text-sm">to</span>
                          <input
                            type="time"
                            value={block.end}
                            onChange={e => {
                              const updated = [...blockedHours]
                              updated[idx] = { ...updated[idx], end: e.target.value }
                              setBlockedHours(updated)
                            }}
                            className="text-sm border border-orange-200 rounded-lg px-2 py-1 bg-white"
                          />
                          <span className="text-xs text-gray-400 ml-1">
                            {(() => {
                              const [sh, sm] = block.start.split(':').map(Number)
                              const [eh, em] = block.end.split(':').map(Number)
                              const diff = (eh * 60 + em) - (sh * 60 + sm)
                              return diff > 0 ? `${diff} min` : ''
                            })()}
                          </span>
                          <button
                            onClick={() => setBlockedHours(prev => prev.filter((_, i) => i !== idx))}
                            className="ml-auto text-orange-300 hover:text-rose-500 text-lg leading-none"
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={async () => {
                    setSavingButton('storeHours')
                    try {
                      // Save all open days with their times (including defaults)
                      for (const day of DAYS) {
                        if (!closedDays.has(day)) {
                          const openTime = businessSettings[`hours_${day}_open`] || '09:00'
                          const closeTime = businessSettings[`hours_${day}_close`] || '18:00'

                          const openRes = await fetch('/api/admin/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key: `hours_${day}_open`, value: openTime })
                          })
                          if (!openRes.ok) throw new Error(`Failed to save ${day} open time`)

                          const closeRes = await fetch('/api/admin/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key: `hours_${day}_close`, value: closeTime })
                          })
                          if (!closeRes.ok) throw new Error(`Failed to save ${day} close time`)
                        }
                      }

                      // Save closed days
                      const closedDaysStr = Array.from(closedDays).join(',')
                      const closedRes = await fetch('/api/admin/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: 'closed_days', value: closedDaysStr })
                      })
                      if (!closedRes.ok) throw new Error('Failed to save closed days')

                      // Also save open_days as numeric day indices (0=Sun,1=Mon,...6=Sat)
                      // so the /api/availability endpoint can correctly block closed days on the booking page
                      const DAY_NAME_TO_NUM: Record<string, number> = {
                        Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6
                      }
                      const openDaysNums = DAYS
                        .filter(d => !closedDays.has(d))
                        .map(d => DAY_NAME_TO_NUM[d])
                      await fetch('/api/admin/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: 'open_days', value: JSON.stringify(openDaysNums) })
                      })

                      // Save slot interval
                      await fetch('/api/admin/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: 'appointment_interval', value: String(slotInterval) })
                      })

                      // Save global open_time / close_time (used by slot & availability APIs)
                      // Derive from the first open day's hours
                      const fmt24to12Global = (t: string) => {
                        const [h24, m24] = t.split(':').map(Number)
                        const period = h24 >= 12 ? 'PM' : 'AM'
                        const h12 = h24 % 12 || 12
                        return `${h12}:${String(m24).padStart(2, '0')} ${period}`
                      }
                      const firstOpenDay = DAYS.find(d => !closedDays.has(d))
                      if (firstOpenDay) {
                        const globalOpen = businessSettings[`hours_${firstOpenDay}_open`] || '09:00'
                        const globalClose = businessSettings[`hours_${firstOpenDay}_close`] || '18:00'
                        await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'open_time', value: fmt24to12Global(globalOpen) }) })
                        await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'close_time', value: fmt24to12Global(globalClose) }) })
                      }

                      // Save blocked hours in 24h "HH:MM" format — no conversion needed,
                      // APIs now read 24h directly so there is zero format mismatch.
                      const toMins24 = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
                      const fmt24label = (t: string) => {
                        const [h, m] = t.split(':').map(Number)
                        const period = h >= 12 ? 'PM' : 'AM'
                        const h12 = h % 12 || 12
                        return `${h12}:${String(m).padStart(2, '0')} ${period}`
                      }
                      const blockedForSave = blockedHours
                        .filter(b => b.start && b.end && toMins24(b.end) > toMins24(b.start))
                      // Store as 24h — simple, no conversion bugs
                      const bhValue = JSON.stringify(blockedForSave)
                      await fetch('/api/admin/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: 'blocked_hours', value: bhValue })
                      })
                      // Update in-state so DB indicator reflects new value immediately
                      setBusinessSettings(prev => ({ ...prev, blocked_hours: bhValue }))

                      const blockSummary = blockedForSave.length > 0
                        ? `Blocked: ${blockedForSave.map(b => `${fmt24label(b.start)}–${fmt24label(b.end)}`).join(', ')}`
                        : 'No blocked periods'
                      setSavingButton('storeHours_done')
                      setTimeout(() => { setSavingButton(null); setSavingMessage(null) }, 4000)
                      setSavingMessage({ type: 'success', text: `✅ Saved! ${blockSummary}` })
                    } catch (err) {
                      setSavingButton(null)
                      setSavingMessage({ type: 'error', text: `❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}` })
                      setTimeout(() => setSavingMessage(null), 5000)
                    }
                  }}
                  disabled={savingButton === 'storeHours'}
                  className="mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-75"
                >
                  {savingButton === 'storeHours' ? '⏳ Saving...' : savingButton === 'storeHours_done' ? '✅ Done!' : 'Save Store Hours'}
                </button>
              </div>
            </div>

            {/* Services & Pricing Section */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800">🛁 Services & Pricing</h2>
                <button
                  onClick={() => {
                    setEditingServiceId(null)
                    setServiceFormData({ id: `svc_${Date.now()}`, name: '', desc: '', tiers: DEFAULT_TIERS.map(t => ({...t})), usesSizeCategories: true })
                  }}
                  className="px-3 py-1 text-sm bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg"
                >
                  + Add Service
                </button>
              </div>

              {/* Service Form — only shown for NEW services at the top; edit is shown inline */}
              {(serviceFormData.id && !services.find(s => s.id === serviceFormData.id)) && (
                <div className="mb-6 p-4 bg-sky-50 rounded-xl border border-sky-200 space-y-3">
                  <p className="text-sm font-bold text-gray-700">New Service</p>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Service Name"
                      value={serviceFormData.name}
                      onChange={e => setServiceFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Short description"
                      value={serviceFormData.desc}
                      onChange={e => setServiceFormData(prev => ({ ...prev, desc: e.target.value }))}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>

                  {/* Size Categories Toggle */}
                  <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={serviceFormData.usesSizeCategories ?? true}
                        onChange={e => setServiceFormData(prev => ({
                          ...prev,
                          usesSizeCategories: e.target.checked,
                          // If switching from no categories to categories, use tiers
                          // If switching from categories to no categories, reset tiers to single price
                          tiers: e.target.checked ? (prev.tiers.length > 1 ? prev.tiers : DEFAULT_TIERS.map(t => ({...t}))) : [{ label: 'Standard', price: prev.price || '', duration: prev.duration || '' }]
                        }))}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <span className="text-xs font-semibold text-gray-700">📏 This service has different sizes/categories (with different prices)</span>
                    </label>
                  </div>

                  {/* Price Tiers or Single Price */}
                  <div>
                    {serviceFormData.usesSizeCategories ? (
                      <>
                        <p className="text-xs font-semibold text-gray-600 mb-2">💰 Price by Size Category (Edit size labels too!)</p>
                    <div className="space-y-2">
                      {serviceFormData.tiers.map((tier, idx) => (
                        <div key={idx} className="space-y-1 p-2 bg-white rounded border border-gray-100">
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <label className="text-xs text-gray-600 block mb-1">Size Category</label>
                              <input
                                type="text"
                                placeholder="e.g., Small (under 15 lbs)"
                                value={tier.label}
                                onChange={e => {
                                  const newTiers = [...serviceFormData.tiers]
                                  newTiers[idx].label = e.target.value
                                  setServiceFormData(prev => ({ ...prev, tiers: newTiers }))
                                }}
                                className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-full"
                              />
                            </div>
                            {serviceFormData.tiers.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const newTiers = serviceFormData.tiers.filter((_, i) => i !== idx)
                                  setServiceFormData(prev => ({ ...prev, tiers: newTiers }))
                                }}
                                className="mt-4 text-red-400 hover:text-red-600 text-sm"
                                title="Remove this size"
                              >✕</button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-gray-600 block mb-1">Price</label>
                              <input
                                type="text"
                                placeholder="50"
                                value={tier.price}
                                onChange={e => {
                                  const newTiers = [...serviceFormData.tiers]
                                  newTiers[idx].price = e.target.value
                                  setServiceFormData(prev => ({ ...prev, tiers: newTiers }))
                                }}
                                className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-full"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600 block mb-1">Duration</label>
                              <input
                                type="text"
                                placeholder="1.5h"
                                value={tier.duration}
                                onChange={e => {
                                  const newTiers = [...serviceFormData.tiers]
                                  newTiers[idx].duration = e.target.value
                                  setServiceFormData(prev => ({ ...prev, tiers: newTiers }))
                                }}
                                className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-full"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setServiceFormData(prev => ({
                            ...prev,
                            tiers: [...prev.tiers, { label: '', price: '', duration: '' }]
                          }))}
                          className="mt-2 text-xs text-purple-600 hover:text-purple-800 font-semibold flex items-center gap-1"
                        >
                          ＋ Add Size
                        </button>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-gray-600 mb-2">💰 Single Price</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-gray-600 block mb-1">Price</label>
                            <input
                              type="text"
                              placeholder="50"
                              value={serviceFormData.price || ''}
                              onChange={e => setServiceFormData(prev => ({ ...prev, price: e.target.value }))}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600 block mb-1">Duration</label>
                            <input
                              type="text"
                              placeholder="1.5h"
                              value={serviceFormData.duration || ''}
                              onChange={e => setServiceFormData(prev => ({ ...prev, duration: e.target.value }))}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        setSavingButton('service')
                        try {
                          const updated = editingServiceId
                            ? services.map(s => s.id === editingServiceId ? serviceFormData : s)
                            : [...services, serviceFormData]

                          const res = await fetch('/api/admin/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key: 'services', value: JSON.stringify(updated) })
                          })
                          if (!res.ok) throw new Error('Failed to save')

                          setServices(updated)
                          setEditingServiceId(null)
                          setServiceFormData({ id: '', name: '', desc: '', tiers: DEFAULT_TIERS.map(t => ({...t})), usesSizeCategories: true })
                          setSavingButton('service_done')
                          setTimeout(() => { setSavingButton(null); setSavingMessage(null) }, 2000)
                          setSavingMessage({ type: 'success', text: '✅ Service saved!' })
                        } catch (err) {
                          setSavingButton(null)
                          setSavingMessage({ type: 'error', text: `❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}` })
                          setTimeout(() => setSavingMessage(null), 5000)
                        }
                      }}
                      disabled={savingButton === 'service'}
                      className="flex-1 px-3 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-75"
                    >
                      {savingButton === 'service' ? '⏳ Saving...' : savingButton === 'service_done' ? '✅ Done!' : 'Save Service'}
                    </button>
                    <button
                      onClick={() => {
                        setEditingServiceId(null)
                        setServiceFormData({ id: '', name: '', desc: '', tiers: DEFAULT_TIERS.map(t => ({...t})), usesSizeCategories: true })
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-semibold rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Services List */}
              <div className="space-y-4">
                {services.length === 0 ? (
                  <p className="text-sm text-gray-500">No services yet. Add one to get started!</p>
                ) : (
                  services.map(service => {
                    const selectedTierIdx = selectedServiceTier[service.id] ?? 0
                    const selectedTier = service.tiers[selectedTierIdx]

                    return (
                      <div key={service.id} data-service-card className="border border-gray-200 rounded-lg overflow-hidden">
                        {/* Service Header */}
                        <div className="bg-gray-50 p-4 border-b border-gray-200">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-bold text-gray-800">{service.name}</p>
                              <p className="text-xs text-gray-600">{service.desc}</p>
                            </div>
                            <div className="flex gap-2 items-center">
                              {/* Visible toggle */}
                              <button
                                onClick={async () => {
                                  const updated = services.map(s =>
                                    s.id === service.id ? { ...s, visible: s.visible === false ? true : false } : s
                                  )
                                  await fetch('/api/admin/settings', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ key: 'services', value: JSON.stringify(updated) })
                                  })
                                  // Also update hidden_service_ids list so /api/availability filters correctly
                                  const hiddenIds = updated.filter(s => s.visible === false).map(s => s.id)
                                  await fetch('/api/admin/settings', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ key: 'hidden_service_ids', value: JSON.stringify(hiddenIds) })
                                  })
                                  setServices(updated)
                                }}
                                className={`text-xs font-semibold px-2 py-1 rounded border ${
                                  service.visible === false
                                    ? 'text-gray-400 border-gray-200 bg-gray-50'
                                    : 'text-emerald-600 border-emerald-200 bg-emerald-50'
                                }`}
                                title={service.visible === false ? 'Hidden from booking page' : 'Visible on booking page'}
                              >
                                {service.visible === false ? '🙈 Hidden' : '👁 Visible'}
                              </button>
                              <button
                                onClick={(e) => {
                                  setEditingServiceId(service.id)
                                  setServiceFormData(service)
                                  // Scroll the clicked card into view so the form is visible
                                  setTimeout(() => {
                                    const card = (e.target as HTMLElement).closest('[data-service-card]')
                                    card?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                  }, 50)
                                }}
                                className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${editingServiceId === service.id ? 'bg-sky-600 text-white' : 'text-sky-600 hover:bg-sky-100'}`}
                              >
                                ✏️ Edit
                              </button>
                              <button
                                onClick={async () => {
                                  try {
                                    const updated = services.filter(s => s.id !== service.id)
                                    const res = await fetch('/api/admin/settings', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ key: 'services', value: JSON.stringify(updated) })
                                    })
                                    if (!res.ok) throw new Error('Failed to delete')
                                    setServices(updated)
                                    setSavingMessage({ type: 'success', text: '✅ Service deleted!' })
                                    setTimeout(() => setSavingMessage(null), 3000)
                                  } catch (err) {
                                    setSavingMessage({ type: 'error', text: `❌ Error deleting service` })
                                    setTimeout(() => setSavingMessage(null), 5000)
                                  }
                                }}
                                className="text-xs font-semibold text-red-600 hover:bg-red-100 px-2 py-1 rounded"
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Inline Edit Form OR Size Selector */}
                        {editingServiceId === service.id ? (
                          /* ── INLINE EDIT FORM ── */
                          <div className="p-4 bg-sky-50 border-t border-sky-200 space-y-3">
                            <p className="text-xs font-bold text-sky-700 uppercase tracking-wide">✏️ Editing Service</p>
                            <div className="grid grid-cols-2 gap-3">
                              <input
                                type="text"
                                placeholder="Service Name"
                                value={serviceFormData.name}
                                onChange={e => setServiceFormData(prev => ({ ...prev, name: e.target.value }))}
                                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                              />
                              <input
                                type="text"
                                placeholder="Short description"
                                value={serviceFormData.desc}
                                onChange={e => setServiceFormData(prev => ({ ...prev, desc: e.target.value }))}
                                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                              />
                            </div>

                            {/* Size Categories Toggle */}
                            <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={serviceFormData.usesSizeCategories ?? true}
                                  onChange={e => setServiceFormData(prev => ({
                                    ...prev,
                                    usesSizeCategories: e.target.checked,
                                    tiers: e.target.checked ? (prev.tiers.length > 1 ? prev.tiers : DEFAULT_TIERS.map(t => ({...t}))) : [{ label: 'Standard', price: prev.price || '', duration: prev.duration || '' }]
                                  }))}
                                  className="w-4 h-4 rounded border-gray-300"
                                />
                                <span className="text-xs font-semibold text-gray-700">📏 Different sizes/categories (different prices)</span>
                              </label>
                            </div>

                            {/* Price Tiers or Single Price */}
                            <div>
                              {serviceFormData.usesSizeCategories ? (
                                <>
                                  <p className="text-xs font-semibold text-gray-600 mb-2">💰 Price by Size Category</p>
                                  <div className="space-y-2">
                                    {serviceFormData.tiers.map((tier, idx) => (
                                      <div key={idx} className="space-y-1 p-2 bg-white rounded border border-gray-100">
                                        <div className="flex items-center gap-2">
                                          <div className="flex-1">
                                            <label className="text-xs text-gray-600 block mb-1">Size Category</label>
                                            <input
                                              type="text"
                                              placeholder="e.g., Small (under 15 lbs)"
                                              value={tier.label}
                                              onChange={e => {
                                                const newTiers = [...serviceFormData.tiers]
                                                newTiers[idx].label = e.target.value
                                                setServiceFormData(prev => ({ ...prev, tiers: newTiers }))
                                              }}
                                              className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-full"
                                            />
                                          </div>
                                          {serviceFormData.tiers.length > 1 && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const newTiers = serviceFormData.tiers.filter((_, i) => i !== idx)
                                                setServiceFormData(prev => ({ ...prev, tiers: newTiers }))
                                              }}
                                              className="mt-4 text-red-400 hover:text-red-600 text-sm"
                                              title="Remove this size"
                                            >✕</button>
                                          )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <div>
                                            <label className="text-xs text-gray-600 block mb-1">Price</label>
                                            <input
                                              type="text"
                                              placeholder="50"
                                              value={tier.price}
                                              onChange={e => {
                                                const newTiers = [...serviceFormData.tiers]
                                                newTiers[idx].price = e.target.value
                                                setServiceFormData(prev => ({ ...prev, tiers: newTiers }))
                                              }}
                                              className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-full"
                                            />
                                          </div>
                                          <div>
                                            <label className="text-xs text-gray-600 block mb-1">Duration</label>
                                            <input
                                              type="text"
                                              placeholder="1.5h"
                                              value={tier.duration}
                                              onChange={e => {
                                                const newTiers = [...serviceFormData.tiers]
                                                newTiers[idx].duration = e.target.value
                                                setServiceFormData(prev => ({ ...prev, tiers: newTiers }))
                                              }}
                                              className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-full"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setServiceFormData(prev => ({
                                      ...prev,
                                      tiers: [...prev.tiers, { label: '', price: '', duration: '' }]
                                    }))}
                                    className="mt-2 text-xs text-purple-600 hover:text-purple-800 font-semibold flex items-center gap-1"
                                  >
                                    ＋ Add Size
                                  </button>
                                </>
                              ) : (
                                <div className="space-y-3">
                                  <p className="text-xs font-semibold text-gray-600 mb-2">💰 Single Price</p>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="text-xs text-gray-600 block mb-1">Price</label>
                                      <input
                                        type="text"
                                        placeholder="50"
                                        value={serviceFormData.price || ''}
                                        onChange={e => setServiceFormData(prev => ({ ...prev, price: e.target.value }))}
                                        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs text-gray-600 block mb-1">Duration</label>
                                      <input
                                        type="text"
                                        placeholder="1.5h"
                                        value={serviceFormData.duration || ''}
                                        onChange={e => setServiceFormData(prev => ({ ...prev, duration: e.target.value }))}
                                        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs"
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={async () => {
                                  setSavingButton('service')
                                  try {
                                    const updated = services.map(s => s.id === editingServiceId ? serviceFormData : s)
                                    const res = await fetch('/api/admin/settings', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ key: 'services', value: JSON.stringify(updated) })
                                    })
                                    if (!res.ok) throw new Error('Failed to save')
                                    setServices(updated)
                                    setEditingServiceId(null)
                                    setServiceFormData({ id: '', name: '', desc: '', tiers: DEFAULT_TIERS.map(t => ({...t})), usesSizeCategories: true })
                                    setSavingButton('service_done')
                                    setTimeout(() => { setSavingButton(null); setSavingMessage(null) }, 2000)
                                    setSavingMessage({ type: 'success', text: '✅ Service saved!' })
                                  } catch (err) {
                                    setSavingButton(null)
                                    setSavingMessage({ type: 'error', text: `❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}` })
                                    setTimeout(() => setSavingMessage(null), 5000)
                                  }
                                }}
                                disabled={savingButton === 'service'}
                                className="flex-1 px-3 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-75"
                              >
                                {savingButton === 'service' ? '⏳ Saving...' : '💾 Save Service'}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingServiceId(null)
                                  setServiceFormData({ id: '', name: '', desc: '', tiers: DEFAULT_TIERS.map(t => ({...t})), usesSizeCategories: true })
                                }}
                                className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-semibold rounded-lg"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ── NORMAL SIZE SELECTOR VIEW ── */
                          <div className="p-4 space-y-3">
                            <p className="text-xs font-semibold text-gray-600">📏 Choose Size</p>
                            <div className="grid grid-cols-2 gap-2">
                              {service.tiers.map((tier, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setSelectedServiceTier(prev => ({ ...prev, [service.id]: idx }))}
                                  className={`p-2 rounded-lg border-2 text-xs font-semibold transition-colors ${
                                    selectedTierIdx === idx
                                      ? 'border-sky-500 bg-sky-50 text-sky-700'
                                      : 'border-gray-200 bg-white text-gray-700 hover:border-sky-300'
                                  }`}
                                >
                                  {tier.label}
                                </button>
                              ))}
                            </div>

                            {/* Prefilled Pricing */}
                            {selectedTier && (
                              <div className="mt-4 p-3 bg-sky-50 rounded-lg border border-sky-200 space-y-2">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Price</label>
                                    <div className="flex items-center">
                                      <span className="text-xs text-gray-600 mr-1">$</span>
                                      <input
                                        type="text"
                                        value={selectedTier.price || service.price || ''}
                                        readOnly
                                        className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700"
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1">Duration</label>
                                    <input
                                      type="text"
                                      value={selectedTier.duration || service.duration || ''}
                                      readOnly
                                      className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700"
                                    />
                                  </div>
                                </div>
                                <p className="text-xs text-gray-500 italic">Click ✏️ Edit above to change pricing</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Business Info Section */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">📞 Business Information</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-semibold text-gray-600 block mb-1">Business Phone</label>
                  <input
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={businessSettings['phone'] || ''}
                    onChange={e => setBusinessSettings(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-600 block mb-1">Business Email</label>
                  <input
                    type="email"
                    placeholder="business@example.com"
                    value={businessSettings['email'] || ''}
                    onChange={e => setBusinessSettings(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-600 block mb-1">Address</label>
                  <input
                    type="text"
                    placeholder="123 Main St, City, State 12345"
                    value={businessSettings['address'] || ''}
                    onChange={e => setBusinessSettings(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <button
                  onClick={async () => {
                    setSavingButton('businessInfo')
                    try {
                      // Save each field individually (allows partial saves and clearing fields)
                      const fieldsToSave = [
                        { key: 'phone', value: businessSettings['phone'] || '' },
                        { key: 'email', value: businessSettings['email'] || '' },
                        { key: 'address', value: businessSettings['address'] || '' }
                      ]

                      for (const field of fieldsToSave) {
                        const res = await fetch('/api/admin/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ key: field.key, value: field.value })
                        })
                        if (!res.ok) {
                          const errorData = await res.json()
                          throw new Error(errorData.error || `Failed to save ${field.key}`)
                        }
                      }
                      setSavingButton('businessInfo_done')
                      setTimeout(() => { setSavingButton(null); setSavingMessage(null) }, 2000)
                      setSavingMessage({ type: 'success', text: '✅ Business info saved!' })
                    } catch (err) {
                      setSavingButton(null)
                      setSavingMessage({ type: 'error', text: `❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}` })
                      setTimeout(() => setSavingMessage(null), 5000)
                    }
                  }}
                  disabled={savingButton === 'businessInfo'}
                  className="mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-75"
                >
                  {savingButton === 'businessInfo' ? '⏳ Saving...' : savingButton === 'businessInfo_done' ? '✅ Done!' : 'Save Business Info'}
                </button>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'account' && (
          <div className="max-w-md">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="mb-5">
                <h3 className="font-bold text-gray-800 text-lg">🔑 My Account</h3>
                <p className="text-xs text-gray-500 mt-1">Update your login username and password.</p>
              </div>

              <div className="space-y-4">
                {/* Username */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Username</label>
                  <input
                    type="text"
                    value={accountForm.username}
                    onChange={e => setAccountForm(prev => ({ ...prev, username: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                    placeholder="Your login username"
                  />
                </div>

                {/* Divider */}
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold text-gray-600 mb-3">Change Password <span className="text-gray-400 font-normal">(leave blank to keep current)</span></p>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">New password</label>
                      <input
                        type="password"
                        value={accountForm.newPassword}
                        onChange={e => setAccountForm(prev => ({ ...prev, newPassword: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                        placeholder="New password"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Confirm new password</label>
                      <input
                        type="password"
                        value={accountForm.confirmPassword}
                        onChange={e => setAccountForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                        placeholder="Confirm new password"
                      />
                    </div>
                  </div>
                </div>

                {/* Status message */}
                {accountMsg && (
                  <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
                    accountMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}>
                    {accountMsg.text}
                  </div>
                )}

                {/* Save button */}
                <button
                  disabled={savingAccount}
                  onClick={async () => {
                    // Validate
                    if (!accountForm.username.trim()) {
                      setAccountMsg({ type: 'error', text: 'Username cannot be empty.' })
                      return
                    }
                    const changingPassword = !!(accountForm.newPassword || accountForm.confirmPassword)
                    if (changingPassword) {
                      if (!accountForm.newPassword) {
                        setAccountMsg({ type: 'error', text: 'New password cannot be empty.' })
                        return
                      }
                      if (accountForm.newPassword !== accountForm.confirmPassword) {
                        setAccountMsg({ type: 'error', text: 'Passwords do not match.' })
                        return
                      }
                    }

                    setSavingAccount(true)
                    setAccountMsg(null)
                    try {
                      const auth = JSON.parse(readAuthRaw('admin') || '{}')
                      const staffId = auth?.staff_id || auth?.id
                      if (!staffId) throw new Error('Not logged in')

                      // Save updates
                      const body: Record<string, string> = { username: accountForm.username.trim() }
                      if (changingPassword) body.password = accountForm.newPassword

                      const res = await fetch(`/api/admin/staff/${staffId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                      })
                      const data = await res.json()
                      if (!res.ok) throw new Error(data.error || 'Failed to save')

                      // Update localStorage so username reflects new value
                      const updatedAuth = { ...auth, username: accountForm.username.trim() }
                      saveAuth(updatedAuth)

                      setAccountMsg({ type: 'success', text: '✅ Account updated successfully!' })
                      setAccountForm(prev => ({ ...prev, newPassword: '', confirmPassword: '' }))
                      setTimeout(() => setAccountMsg(null), 5000)
                    } catch (err) {
                      setAccountMsg({ type: 'error', text: `❌ ${err instanceof Error ? err.message : 'Something went wrong'}` })
                    } finally {
                      setSavingAccount(false)
                    }
                  }}
                  className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                >
                  {savingAccount ? '⏳ Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'coupons' && (
          <div className="max-w-2xl space-y-6">
            {/* Header */}
            <div>
              <h3 className="font-bold text-gray-800 text-lg">🎟️ Discount Coupons</h3>
              <p className="text-xs text-gray-500 mt-1">Create discount coupons that groomers can apply at checkout. Supports percentage or fixed dollar discounts.</p>
            </div>

            {/* Feedback message */}
            {couponMsg && (
              <div className={`p-3 rounded-xl text-sm font-semibold ${couponMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                {couponMsg.text}
              </div>
            )}

            {/* Create / Edit form */}
            <div className="bg-sky-50 border border-sky-100 rounded-2xl p-5 space-y-4">
              <p className="text-xs font-bold uppercase tracking-widest text-sky-700">{editingCouponId ? 'Edit Coupon' : 'New Coupon'}</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Coupon name *</label>
                  <input
                    placeholder="e.g. First Time Customer"
                    value={couponForm.name}
                    onChange={e => setCouponForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full border border-sky-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Short code (optional)</label>
                  <input
                    placeholder="e.g. FIRST20"
                    value={couponForm.code}
                    onChange={e => setCouponForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                    className="w-full border border-sky-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 uppercase"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Discount type *</label>
                  <select
                    value={couponForm.discount_type}
                    onChange={e => setCouponForm(p => ({ ...p, discount_type: e.target.value as 'percent' | 'fixed' }))}
                    className="w-full border border-sky-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                  >
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed amount ($)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">
                    Discount value * {couponForm.discount_type === 'percent' ? '(e.g. 20 = 20% off)' : '(e.g. 10 = $10 off)'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">
                      {couponForm.discount_type === 'percent' ? '%' : '$'}
                    </span>
                    <input
                      type="number" min="0" max={couponForm.discount_type === 'percent' ? '100' : undefined} step="0.01"
                      placeholder={couponForm.discount_type === 'percent' ? '20' : '10'}
                      value={couponForm.discount_value}
                      onChange={e => setCouponForm(p => ({ ...p, discount_value: e.target.value }))}
                      className="w-full border border-sky-200 rounded-xl pl-8 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  disabled={savingCoupon || !couponForm.name || !couponForm.discount_value}
                  onClick={async () => {
                    if (!couponForm.name || !couponForm.discount_value) return
                    setSavingCoupon(true)
                    setCouponMsg(null)
                    try {
                      const method = editingCouponId ? 'PATCH' : 'POST'
                      const body = editingCouponId
                        ? { id: editingCouponId, ...couponForm, discount_value: couponForm.discount_value }
                        : couponForm
                      const res = await fetch('/api/admin/coupons', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
                      const data = await res.json()
                      if (data.error) throw new Error(data.error)
                      setCouponMsg({ type: 'success', text: editingCouponId ? '✓ Coupon updated!' : '✓ Coupon created!' })
                      setCouponForm({ name: '', code: '', discount_type: 'percent', discount_value: '' })
                      setEditingCouponId(null)
                      await loadCoupons()
                    } catch (e: unknown) {
                      setCouponMsg({ type: 'error', text: (e instanceof Error ? e.message : 'Failed to save coupon') })
                    } finally {
                      setSavingCoupon(false)
                    }
                  }}
                  className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
                >
                  {savingCoupon ? '⏳ Saving…' : editingCouponId ? '💾 Update Coupon' : '+ Create Coupon'}
                </button>
                {editingCouponId && (
                  <button
                    onClick={() => { setEditingCouponId(null); setCouponForm({ name: '', code: '', discount_type: 'percent', discount_value: '' }) }}
                    className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-semibold rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Coupons list */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              {coupons.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">No coupons yet — create one above</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {coupons.map(c => (
                    <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                      {/* Active toggle */}
                      <button
                        onClick={async () => {
                          await fetch('/api/admin/coupons', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, active: !c.active }) })
                          setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, active: !c.active } : x))
                        }}
                        className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${c.active ? 'bg-emerald-400' : 'bg-gray-200'}`}
                        title={c.active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                      >
                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${c.active ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-800 text-sm">{c.name}</span>
                          {c.code && (
                            <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-mono font-bold">{c.code}</span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${c.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                            {c.active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {c.discount_type === 'percent' ? `${c.discount_value}% off` : `$${c.discount_value} off`}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => {
                            setEditingCouponId(c.id)
                            setCouponForm({ name: c.name, code: c.code ?? '', discount_type: c.discount_type, discount_value: c.discount_value.toString() })
                            setCouponMsg(null)
                            window.scrollTo({ top: 0, behavior: 'smooth' })
                          }}
                          className="text-xs px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 font-semibold rounded-lg transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete "${c.name}"?`)) return
                            await fetch('/api/admin/coupons', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id }) })
                            setCoupons(prev => prev.filter(x => x.id !== c.id))
                          }}
                          className="text-xs px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-lg transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'tags' && (
          <div className="max-w-2xl bg-white rounded-2xl border border-gray-200 p-6">
            <div className="mb-4">
              <h3 className="font-bold text-gray-800 text-lg">🏷️ Pet Tags</h3>
              <p className="text-xs text-gray-500 mt-1">Create color-coded tags to categorize pets (Aggressive, Senior, Matted, VIP, etc). Use them to filter and research clients.</p>
            </div>

            <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 mb-5 space-y-3">
              <p className="text-xs font-semibold text-sky-700">New tag</p>
              <input
                placeholder="Tag name (e.g. Aggressive, Senior)"
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                className="w-full border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
              <div>
                <p className="text-xs text-gray-500 mb-1.5">Color</p>
                <div className="flex flex-wrap gap-2">
                  {['sky','rose','amber','violet','emerald','teal','pink','gray','indigo','orange'].map(c => {
                    const swatch: Record<string,string> = {
                      sky:'bg-sky-500', rose:'bg-rose-500', amber:'bg-amber-500', violet:'bg-violet-500',
                      emerald:'bg-emerald-500', teal:'bg-teal-500', pink:'bg-pink-500', gray:'bg-gray-500',
                      indigo:'bg-indigo-500', orange:'bg-orange-500',
                    }
                    return (
                      <button key={c} type="button" onClick={() => setNewTagColor(c)}
                        className={`w-8 h-8 rounded-full ${swatch[c]} ${newTagColor === c ? 'ring-2 ring-offset-2 ring-sky-600' : ''}`}
                        title={c} />
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
                      setTags(prev => [...prev, data.tag].sort((a,b) => a.name.localeCompare(b.name)))
                      setNewTagName(''); setNewTagColor('sky')
                    } else if (data.error) { alert(data.error) }
                  } finally { setSavingTag(false) }
                }}
                className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg">
                {savingTag ? 'Adding…' : '+ Add Tag'}
              </button>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Existing tags ({tags.length})</p>
              {tags.length === 0
                ? <p className="text-sm text-gray-400 italic">No tags yet. Create your first one above.</p>
                : <div className="flex flex-wrap gap-2">
                    {tags.map(tag => (
                      <div key={tag.id} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium ${tagClasses(tag.color)}`}>
                        <span>{tag.name}</span>
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete tag "${tag.name}"? It will be removed from all pets.`)) return
                            await fetch('/api/admin/tags', {
                              method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: tag.id }),
                            })
                            setTags(prev => prev.filter(t => t.id !== tag.id))
                          }}
                          className="hover:bg-black/10 rounded-full w-4 h-4 flex items-center justify-center text-xs">✕</button>
                      </div>
                    ))}
                  </div>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
