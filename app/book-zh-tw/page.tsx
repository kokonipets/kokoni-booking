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
        placeholder="例：Chihuahua"
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

const SERVICES = [
  { id: 'simply_cute', name: '簡單可愛 – 日常造型', desc: '經典修剪、洗澡、吹乾及最後修飾', icon: '✂️', durationMinutes: 120 },
  { id: 'bath_brush', name: '洗澡梳毛', desc: '全面洗澡、吹乾及梳毛', icon: '🛁', durationMinutes: 120 },
  { id: 'asian_fusion', name: '亞洲混搭造型', desc: '帶有現代亞洲風格的創意造型', icon: '🌸', durationMinutes: 180 },
]

const TIME_SLOTS = [
  '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
  '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM',
  '3:00 PM', '3:30 PM', '4:00 PM',
]

const WEIGHT_OPTIONS = [
  { en: 'Small (under 10 lbs)', zh: '小型（10磅以下）' },
  { en: 'Medium (11–25 lbs)', zh: '中型（11–25磅）' },
  { en: 'Large (26–45 lbs)', zh: '大型（26–45磅）' },
  { en: 'XL (45+ lbs)', zh: '超大型（45磅以上）' },
]

const TERMS_OF_SERVICE_ZH_TW = `Kokoni Grooming Salon — 服務條款

資料揭露
美容對寵物而言可能造成壓力，長期不進行美容更可能對您的寵物造成嚴重不適。請務必告知美容師您的寵物任何已知的健康問題、近期獸醫就診記錄或美容問題，以便美容師隨時注意異常跡象。

若您未告知任何過敏或皮膚問題，Kokoni 對於因美容過程而引起的任何刺激、脫毛、擦傷或毛髮損失不承擔責任。

若您未告知任何身體或醫療狀況（如肘部或髖部發育不良、癲癇等），Kokoni 對於美容過程中發生的任何傷害不承擔責任。

客戶同意 Kokoni 及其所有者和經營者對美容期間發現的任何既有狀況或問題不承擔責任，且寵物主人同意承擔因此產生的所有醫療費用。

跳蚤與壁蝨
若在美容過程中發現您的寵物有跳蚤和／或壁蝨，治療費用將強制由飼主負擔，並另收取額外費用。

毛結與去毛結
所有毛髮嚴重打結的寵物均需收取「去毛結費用」。去除嚴重打結的毛髮可能有切傷、割傷或擦傷的風險。作為寵物的主人，您同意 Kokoni 對於因去除打結／疏於護理的毛髮而造成的任何切割／割傷／擦傷或美容後的影響不承擔責任。

攻擊性寵物
飼主必須告知美容師您的寵物是否可能咬人、曾經咬過人或有攻擊行為跡象。對於具攻擊性或難以美容的寵物，可能會收取額外的處理費用。Kokoni 保留在任何時候拒絕或停止服務的權利。

遲交接寵物
若您的寵物未能在下午 5:00 關門前被接回，每逾 30 分鐘將收取 $25 的遲交接費用。

未到店及取消預約
未到店及多次臨時取消預約者，每隻寵物需支付 $30 的缺席費用。請提前 24 小時通知我們。如需再次預約，可能需要預付款項。

疫苗接種
所有寵物必須按時接種所有疫苗，包括狂犬病及犬瘟熱或細小病毒疫苗。您可以直接在本表單上傳記錄，或發送電子郵件至 kokonipets@gmail.com。

視覺授權及使用
在店內停留或美容期間拍攝的寵物圖像、照片和影片，以及其名稱，可由本店以任何形式或格式用於任何媒體、行銷、廣告或促銷材料中。`

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
  return date.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
}
function formatDateShort(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
}

const STEPS_ORDER: Step[] = ['phone', 'new-client', 'select-pet', 'service', 'datetime', 'vaccine-notes', 'tos', 'confirmed']

export default function BookPageZhTw() {
  const [step, setStep] = useState<Step>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [phone, setPhone] = useState('')
  const [smsConsentChecked, setSmsConsentChecked] = useState(false)

  const [clientName, setClientName] = useState('')
  const [isNewClient, setIsNewClient] = useState(false)
  const [newClientFirstName, setNewClientFirstName] = useState('')
  const [newClientLastName, setNewClientLastName] = useState('')
  const [newClientName, setNewClientName] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')

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

  const [service, setService] = useState('')

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [calMonth, setCalMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState('')

  const [vaccineFile, setVaccineFile] = useState<File | null>(null)
  const [vaccineEmailOnly, setVaccineEmailOnly] = useState(false)
  const [vaccineSmsOnly, setVaccineSmsOnly] = useState(false)
  const [notes, setNotes] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [tosAgreed, setTosAgreed] = useState(false)
  const tosRef = useRef<HTMLDivElement>(null)

  const [appointmentId, setAppointmentId] = useState('')
  const [needsVaccineEmail, setNeedsVaccineEmail] = useState(false)
  const [vaccineContactMethod, setVaccineContactMethod] = useState<'email' | 'text' | null>(null)

  const [allowedDays, setAllowedDays] = useState<number[]>([1, 2, 3, 4, 5, 6])
  const [blockedDates, setBlockedDates] = useState<string[]>([])
  const [dynamicTimeSlots, setDynamicTimeSlots] = useState<string[]>(TIME_SLOTS)
  const [openDaysLabel, setOpenDaysLabel] = useState('週一至週六')
  const [dynamicServices, setDynamicServices] = useState(SERVICES)
  const [dateSlots, setDateSlots] = useState<string[] | null>(null)
  const [dateSlotsLoading, setDateSlotsLoading] = useState(false)
  const selectedDateRef = useRef<Date | null>(null)

  const DAY_ZH = ['日', '一', '二', '三', '四', '五', '六']

  const fetchAvailability = useCallback(() => {
    fetch(`/api/availability?t=${Date.now()}`)
      .then(r => r.json())
      .then(data => {
        if (data.open_days) {
          setAllowedDays(data.open_days)
          setOpenDaysLabel(data.open_days.map((d: number) => '週' + DAY_ZH[d]).join('、'))
        }
        if (Array.isArray(data.blocked_dates)) setBlockedDates(data.blocked_dates)
        if (data.time_slots && data.time_slots.length > 0) setDynamicTimeSlots(data.time_slots)
        if (data.services && data.services.length > 0) {
          const withDurations = data.services.map((s: any) => {
            const serviceDef = SERVICES.find(srv => srv.id === s.id)
            // Use Chinese name/desc if available from our map, else use API name
            return {
              ...s,
              name: serviceDef?.name || s.name,
              desc: serviceDef?.desc || s.desc,
              durationMinutes: serviceDef?.durationMinutes || 0,
            }
          })
          setDynamicServices(withDurations)
        }
      })
      .catch(() => {})
  }, [])

  const fetchDateSlots = useCallback((date: Date | null) => {
    if (!date) { setDateSlots(null); return }
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const dateStr = `${yyyy}-${mm}-${dd}`
    setDateSlotsLoading(true)
    setDateSlots(null)
    fetch(`/api/slots?date=${dateStr}&t=${Date.now()}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data.slots)) setDateSlots(data.slots) })
      .catch(() => {})
      .finally(() => setDateSlotsLoading(false))
  }, [])

  useEffect(() => {
    fetchAvailability()
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchAvailability()
        fetchDateSlots(selectedDateRef.current)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchAvailability, fetchDateSlots])

  useEffect(() => {
    selectedDateRef.current = selectedDate
    fetchDateSlots(selectedDate)
  }, [selectedDate, fetchDateSlots])

  const handlePhoneLookup = async () => {
    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 10) {
      setError('請輸入有效的10位數電話號碼。')
      return
    }
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
      setError('發生錯誤，請重試。')
    } finally {
      setLoading(false)
    }
  }

  const handleNewClientContinue = () => {
    if (!newClientFirstName.trim()) { setError('請輸入您的名字。'); return }
    if (!newPetName.trim()) { setError('請輸入狗狗的名字。'); return }
    if (!newPetWeight) { setError('請選擇狗狗的體重範圍。'); return }
    setError('')
    const fullName = `${newClientFirstName.trim()} ${newClientLastName.trim()}`.trim()
    setNewClientName(fullName)
    setClientName(fullName)
    setStep('service')
  }

  const uploadPetPhoto = async (petId: string, file: File) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
      setError('請使用 JPG、PNG 或 WEBP 格式的照片。')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('照片過大（最大 50 MB），請選擇較小的檔案。')
      return
    }
    const localUrl = URL.createObjectURL(file)
    setPets(prev => prev.map(p => p.id === petId ? { ...p, photo_url: localUrl } : p))
    setSelectedPet(prev => prev?.id === petId ? { ...prev, photo_url: localUrl } : prev)
    setUploadingPetPhotoId(petId)
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
        setError(data.error || '照片上傳失敗，請重試。')
      }
    } catch {
      setError('照片上傳失敗，請重試。')
    } finally {
      setUploadingPetPhotoId(null)
    }
  }

  const handlePetContinue = () => {
    if (!selectedPet && !isAddingNewPet) { setError('請選擇狗狗或新增一隻新狗狗。'); return }
    if (isAddingNewPet && !newPetName.trim()) { setError('請輸入狗狗的名字。'); return }
    if (isAddingNewPet && !newPetWeight) { setError('請選擇狗狗的體重範圍。'); return }
    setError('')
    setStep('service')
  }

  const handleServiceContinue = () => {
    if (!service) { setError('請選擇服務項目。'); return }
    setError('')
    setStep('datetime')
  }

  const handleDateTimeContinue = () => {
    if (!selectedDate) { setError('請選擇日期。'); return }
    if (!selectedTime) { setError('請選擇時間。'); return }
    setError('')
    setStep('vaccine-notes')
  }

  const handleVaccineContinue = () => {
    const petNeedsVaccine = isNewClient || isAddingNewPet ||
      (selectedPet && selectedPet.vaccine_status === 'pending')
    if (petNeedsVaccine && !vaccineFile && !vaccineEmailOnly && !vaccineSmsOnly) {
      setError('請上傳疫苗記錄，或選擇以電子郵件／簡訊傳送。')
      return
    }
    setError('')
    setStep('tos')
  }

  const handleSubmit = async () => {
    if (!tosAgreed) { setError('請同意服務條款。'); return }
    setError('')
    setLoading(true)
    try {
      const digits = phone.replace(/\D/g, '')
      const payload: Record<string, unknown> = {
        phone: digits, service,
        date: formatDateShort(selectedDate!),
        time: selectedTime, notes,
        tosAgreedAt: new Date().toISOString(),
        smsConsent: smsConsentChecked,
        smsConsentAt: smsConsentChecked ? new Date().toISOString() : null,
      }
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
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '預約失敗')
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
      setError(e instanceof Error ? e.message : '發生錯誤，請重試。')
    } finally {
      setLoading(false)
    }
  }

  const prevMonth = () => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))
  const nextMonth = () => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))

  const renderCalendar = () => {
    const year = calMonth.getFullYear()
    const month = calMonth.getMonth()
    const totalDays = daysInMonth(year, month)
    const firstDay = firstDayOfMonth(year, month)
    const cells: (number | null)[] = Array(firstDay).fill(null)
    for (let d = 1; d <= totalDays; d++) cells.push(d)
    const monthName = calMonth.toLocaleString('zh-TW', { month: 'long', year: 'numeric' })
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
          {['日','一','二','三','四','五','六'].map(d => (
            <div key={d} className="text-xs font-medium text-gray-400 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {cells.map((day, idx) => {
            if (!day) return <div key={idx} />
            const date = new Date(year, month, day)
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const isToday = date.toDateString() === today.toDateString()
            const isPast = !isToday && date < today
            const isClosed = !allowedDays.includes(date.getDay())
            const isBlockedDate = !isToday && blockedDates.includes(dateStr)
            const isDisabled = isPast || isClosed || isBlockedDate
            const isSelected = selectedDate?.toDateString() === date.toDateString()
            return (
              <button key={idx} disabled={isDisabled}
                onClick={() => { setSelectedDate(date); setSelectedTime('') }}
                className={`rounded-full w-9 h-9 text-sm font-medium mx-auto flex items-center justify-center transition-all relative cursor-pointer
                  ${isSelected ? 'bg-sky-600 text-white shadow-md' : ''}
                  ${!isSelected && isToday ? 'border-2 border-sky-500 text-sky-700 hover:bg-sky-100' : ''}
                  ${!isSelected && !isToday && !isDisabled ? 'hover:bg-sky-100 text-gray-800' : ''}
                  ${isDisabled ? 'text-gray-300 cursor-not-allowed' : ''}`}
                title={isToday ? '今天' : isBlockedDate ? '不可預約' : isClosed ? '休息日' : ''}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const stepIdx = STEPS_ORDER.indexOf(step)
  const totalSteps = STEPS_ORDER.length - 1

  return (
    <div className="min-h-screen bg-sky-50 flex flex-col items-center justify-start py-8 px-4">
      {/* Header */}
      <div className="flex flex-col items-center mb-6">
        <Image src="/logo.png" alt="Kokoni Pet Grooming Salon" width={160} height={120} className="object-contain mb-1" priority />
        <p className="text-sm text-sky-600 font-medium">線上預約</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-gray-400">語言：</span>
          <a href="/book?lang=en" className="text-xs text-gray-500 hover:text-sky-600 px-2 py-0.5 rounded-full hover:bg-sky-50 transition-colors">English</a>
          <span className="text-xs font-semibold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">繁體中文</span>
          <a href="/book-zh-cn" className="text-xs text-gray-500 hover:text-sky-600 px-2 py-0.5 rounded-full hover:bg-sky-50 transition-colors">简体中文</a>
        </div>
      </div>

      {step !== 'confirmed' && (
        <div className="w-full max-w-md mb-6">
          <div className="flex items-center gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i < stepIdx ? 'bg-sky-500' : i === stepIdx ? 'bg-sky-700' : 'bg-gray-200'}`} />
            ))}
          </div>
        </div>
      )}

      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">

        {/* ── STEP: PHONE ── */}
        {step === 'phone' && (
          <div className="p-6">
            <h2 className="text-xl font-bold text-sky-900 mb-1">預約美容</h2>
            <p className="text-sm text-gray-500 mb-6">請輸入您的電話號碼以開始預約</p>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Phone className="w-4 h-4 inline mr-1 text-sky-600" />電話號碼
            </label>
            <input
              type="tel" placeholder="(949) 000-0000" value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && handlePhoneLookup()}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg tracking-wide focus:outline-none focus:ring-2 focus:ring-sky-400 mb-4"
            />
            <div className="mt-4 p-3 bg-sky-50 border border-sky-100 rounded-xl">
              <p className="text-xs text-gray-600 leading-relaxed">
                <strong>選填：</strong>勾選下方方框，即代表您同意透過簡訊接收來自 <strong>Kokoni Pet Grooming Salon</strong> 的預約確認、提醒及取件通知。訊息頻率不定（每次預約約 2–5 則）。可能會產生訊息及數據費用。回覆 <strong>STOP</strong> 取消訂閱，<strong>HELP</strong> 取得協助。請參閱我們的{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-sky-600 underline">隱私政策</a>及{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-sky-600 underline">服務條款</a>。
                <strong>同意接收簡訊並非預約的必要條件。</strong>
              </p>
            </div>
            <label className="flex items-start gap-3 mt-4 cursor-pointer">
              <input type="checkbox" checked={smsConsentChecked} onChange={e => setSmsConsentChecked(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-sky-600 cursor-pointer flex-shrink-0" />
              <span className="text-xs text-gray-700 leading-relaxed">
                <strong>（選填）</strong>我同意依上述說明接收 Kokoni Pet Grooming Salon 的簡訊預約通知。
              </span>
            </label>
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <button onClick={handlePhoneLookup} disabled={loading}
              className="w-full mt-4 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {loading ? '查詢中...' : '繼續'}
            </button>
            <div className="mt-4 pt-4 border-t border-gray-100 text-center">
              <a href="/profile" className="text-sm text-sky-600 hover:underline">👤 查看我的個人資料及預約 →</a>
            </div>
          </div>
        )}

        {/* ── STEP: NEW CLIENT ── */}
        {step === 'new-client' && (
          <div className="p-6">
            <button onClick={() => setStep('phone')} className="flex items-center text-sky-600 text-sm mb-4 hover:underline">
              <ChevronLeft className="w-4 h-4" /> 返回
            </button>
            <h2 className="text-xl font-bold text-sky-900 mb-1">歡迎！讓我們為您建立資料</h2>
            <p className="text-sm text-gray-500 mb-5">第一次來嗎？很高興認識您！</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">您的姓名 <span className="text-rose-500">*</span></label>
                <div className="grid grid-cols-2 gap-3">
                  <input type="text" placeholder="名字" value={newClientFirstName}
                    onChange={e => setNewClientFirstName(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-400" />
                  <input type="text" placeholder="姓氏" value={newClientLastName}
                    onChange={e => setNewClientLastName(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-400" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">電子郵件 <span className="text-gray-400">（選填）</span></label>
                <input type="email" placeholder="you@email.com" value={newClientEmail}
                  onChange={e => setNewClientEmail(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-400" />
              </div>
              <hr className="border-gray-100" />
              <p className="text-sm font-semibold text-sky-800">🐾 您的狗狗</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">狗狗姓名 <span className="text-rose-500">*</span></label>
                <input type="text" placeholder="例：花生" value={newPetName}
                  onChange={e => setNewPetName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">品種 <span className="text-gray-400">（選填）</span></label>
                <BreedInput value={newPetBreed} onChange={setNewPetBreed} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">體重 <span className="text-rose-500">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {WEIGHT_OPTIONS.map(w => (
                    <button key={w.en} type="button" onClick={() => setNewPetWeight(newPetWeight === w.en ? '' : w.en)}
                      className={`py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${newPetWeight === w.en ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 text-gray-600 hover:border-sky-300'}`}>
                      {w.zh}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">生日 <span className="text-gray-400">（選填）</span></label>
                <input type="date" value={newPetBirthday} onChange={e => setNewPetBirthday(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-400" />
              </div>
            </div>
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <button onClick={handleNewClientContinue}
              className="w-full mt-6 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors">繼續</button>
          </div>
        )}

        {/* ── STEP: SELECT PET ── */}
        {step === 'select-pet' && (
          <div className="p-6">
            <button onClick={() => setStep('phone')} className="flex items-center text-sky-600 text-sm mb-4 hover:underline">← 返回</button>
            <h2 className="text-xl font-bold text-sky-900 mb-1">
              {clientName && !/^\d+$/.test(clientName.trim()) ? `您好，${clientName.split(' ')[0]}！👋` : '您好！👋'}
            </h2>
            <p className="text-sm text-gray-500 mb-5">今天哪隻狗狗要來美容？</p>
            <div className="space-y-3">
              {pets.map(pet => (
                <div key={pet.id} className={`rounded-xl border-2 transition-all ${selectedPet?.id === pet.id && !isAddingNewPet ? 'border-sky-500 bg-sky-50' : 'border-gray-100'}`}>
                  <button onClick={() => { setSelectedPet(pet); setIsAddingNewPet(false) }}
                    className="w-full flex items-center gap-4 p-4 text-left">
                    {pet.photo_url ? (
                      <img src={pet.photo_url} alt={pet.name} className="w-12 h-12 rounded-full object-cover border-2 border-sky-100 shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center text-2xl shrink-0">🐶</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800">{pet.name}</p>
                      {pet.breed && <p className="text-sm text-gray-400">{pet.breed}</p>}
                    </div>
                    {selectedPet?.id === pet.id && !isAddingNewPet && <CheckCircle2 className="w-5 h-5 text-sky-500 shrink-0" />}
                  </button>
                  {selectedPet?.id === pet.id && !isAddingNewPet && (
                    <div className="px-4 pb-3 flex items-center gap-2 border-t border-sky-100">
                      <label className={`flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                        uploadingPetPhotoId === pet.id ? 'bg-sky-400' : uploadDonePetId === pet.id ? 'bg-green-500' : 'bg-sky-500 hover:bg-sky-600'}`}>
                        {uploadingPetPhotoId === pet.id ? '上傳中...' : uploadDonePetId === pet.id ? '✓ 完成！' : '📷 更新照片'}
                        <input type="file" accept="image/*" className="hidden" disabled={uploadingPetPhotoId === pet.id}
                          onChange={e => { const file = e.target.files?.[0]; if (file) uploadPetPhoto(pet.id, file) }} />
                      </label>
                      <span className="text-xs text-gray-400">{pet.photo_url ? '更換照片' : '新增照片'}</span>
                    </div>
                  )}
                </div>
              ))}
              <button onClick={() => { setIsAddingNewPet(true); setSelectedPet(null) }}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${isAddingNewPet ? 'border-sky-500 bg-sky-50' : 'border-dashed border-gray-200 hover:border-sky-300'}`}>
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl">➕</div>
                <p className="font-medium text-gray-600">新增一隻狗狗</p>
                {isAddingNewPet && <CheckCircle2 className="w-5 h-5 text-sky-500 ml-auto" />}
              </button>
            </div>
            {isAddingNewPet && (
              <div className="mt-4 space-y-3">
                <input type="text" placeholder="狗狗姓名 *" value={newPetName} onChange={e => setNewPetName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-400" />
                <BreedInput value={newPetBreed} onChange={setNewPetBreed} />
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">體重 <span className="text-rose-500">*</span></p>
                  <div className="grid grid-cols-2 gap-2">
                    {WEIGHT_OPTIONS.map(w => (
                      <button key={w.en} type="button" onClick={() => setNewPetWeight(newPetWeight === w.en ? '' : w.en)}
                        className={`py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${newPetWeight === w.en ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 text-gray-600 hover:border-sky-300'}`}>
                        {w.zh}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">生日 <span className="text-gray-400">（選填）</span></p>
                  <input type="date" value={newPetBirthday} onChange={e => setNewPetBirthday(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-400" />
                </div>
                <label className="flex items-center gap-3 p-3 border border-dashed border-sky-300 rounded-xl cursor-pointer hover:bg-sky-50 transition-colors">
                  {newPetPhotoPreview ? (
                    <img src={newPetPhotoPreview} alt="preview" className="w-12 h-12 rounded-full object-cover border-2 border-sky-200" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center text-2xl">📷</div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-sky-600">{newPetPhotoFile ? newPetPhotoFile.name : '新增照片（選填）'}</p>
                    <p className="text-xs text-gray-400">點擊選擇您的狗狗照片</p>
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) { setNewPetPhotoFile(file); setNewPetPhotoPreview(URL.createObjectURL(file)) }
                  }} />
                </label>
              </div>
            )}
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <button onClick={handlePetContinue}
              className="w-full mt-6 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors">繼續</button>
          </div>
        )}

        {/* ── STEP: SERVICE ── */}
        {step === 'service' && (
          <div className="p-6">
            <button onClick={() => setStep(isNewClient ? 'new-client' : 'select-pet')} className="flex items-center text-sky-600 text-sm mb-4 hover:underline">
              <ChevronLeft className="w-4 h-4" /> 返回
            </button>
            <h2 className="text-xl font-bold text-sky-900 mb-1">
              <Scissors className="w-5 h-5 inline mr-2 text-sky-600" />選擇服務
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              為 {isNewClient ? newPetName : (isAddingNewPet ? newPetName : selectedPet?.name)} 選擇
            </p>
            <div className="space-y-4">
              {dynamicServices.filter(s => s.visible !== false).map(s => (
                <button key={s.id} onClick={() => setService(s.id)}
                  className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left group ${service === s.id ? 'border-sky-500 bg-sky-50' : 'border-gray-100 hover:border-sky-200'}`}>
                  <span className="text-2xl mt-0.5">{s.icon}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">{s.name}</p>
                    <p className="text-sm text-gray-400 mt-0.5 max-h-0 overflow-hidden group-hover:max-h-20 transition-all duration-200">{s.desc}</p>
                  </div>
                  {service === s.id && <CheckCircle2 className="w-5 h-5 text-sky-500 mt-1" />}
                </button>
              ))}
            </div>
            {/* ── 價格參考 ── */}
            <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50 overflow-hidden">
              <div className="px-4 py-3 bg-sky-100 text-sky-900 font-semibold text-sm">💰 價格參考</div>
              <div className="p-4 space-y-5 text-xs text-gray-700">

                {/* 洗澡美容 */}
                <div>
                  <p className="font-bold text-sky-800 mb-2">🛁 洗澡 &amp; 梳毛</p>
                  <table className="w-full text-center border-collapse">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="text-left pb-1 font-medium">體型</th>
                        <th className="pb-1 font-medium">短毛</th>
                        <th className="pb-1 font-medium">長毛</th>
                        <th className="pb-1 font-medium">貴賓/雙層</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sky-100">
                      <tr><td className="text-left py-1">15磅以下</td><td>$50</td><td>$60</td><td>$70</td></tr>
                      <tr><td className="text-left py-1">16–30磅</td><td>$60</td><td>$75</td><td>$85</td></tr>
                      <tr><td className="text-left py-1">31–50磅</td><td>$70</td><td>$85</td><td>$100</td></tr>
                      <tr><td className="text-left py-1">50–70磅</td><td>$80</td><td>$95</td><td>$120</td></tr>
                    </tbody>
                  </table>
                </div>

                {/* 洗澡剪毛 */}
                <div>
                  <p className="font-bold text-sky-800 mb-2">✂️ 洗澡 &amp; 剪毛</p>
                  <table className="w-full text-center border-collapse">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="text-left pb-1 font-medium">體型</th>
                        <th className="pb-1 font-medium">Simply Cute</th>
                        <th className="pb-1 font-medium">亞洲風格</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sky-100">
                      <tr><td className="text-left py-1">15磅以下</td><td>$70</td><td>$110</td></tr>
                      <tr><td className="text-left py-1">16–30磅</td><td>$90</td><td>$130</td></tr>
                      <tr><td className="text-left py-1">31–50磅</td><td>$100</td><td>$190</td></tr>
                      <tr><td className="text-left py-1">51–70磅</td><td>$120</td><td>$240</td></tr>
                    </tbody>
                  </table>
                  <p className="text-gray-400 mt-1 italic">* 70磅以上請洽詢我們。</p>
                </div>

                {/* 貴賓/泰迪 洗澡剪毛 */}
                <div>
                  <p className="font-bold text-sky-800 mb-2">🐩 貴賓/泰迪 洗澡 &amp; 剪毛</p>
                  <table className="w-full text-center border-collapse">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="text-left pb-1 font-medium">體型</th>
                        <th className="pb-1 font-medium">Simply Cute</th>
                        <th className="pb-1 font-medium">亞洲風格</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sky-100">
                      <tr><td className="text-left py-1">15磅以下</td><td>$100</td><td>$130</td></tr>
                      <tr><td className="text-left py-1">16–30磅</td><td>$120</td><td>$170</td></tr>
                      <tr><td className="text-left py-1">31–50磅</td><td>$140</td><td>$240</td></tr>
                      <tr><td className="text-left py-1">51–70磅</td><td>$170</td><td>$290</td></tr>
                    </tbody>
                  </table>
                </div>

                {/* 附加服務 */}
                <div>
                  <p className="font-bold text-sky-800 mb-2">➕ 附加服務（加於套餐上）</p>
                  <ul className="space-y-0.5 text-gray-600">
                    <li>局部修剪 — <span className="font-medium">+$10–$30</span></li>
                    <li>除蚤洗毛精 — <span className="font-medium">+$15/$25</span></li>
                    <li>除結/加強梳毛 — <span className="font-medium">+$20/$40/$60</span></li>
                    <li>除毛服務 — <span className="font-medium">+$15/$20/$30</span></li>
                    <li>手工修毛 — <span className="font-medium">+$20/$40</span></li>
                    <li>額外協助費 — <span className="font-medium">+$20</span></li>
                    <li>染毛 — <span className="font-medium">起價 $30</span>（局部 $15–$25 · 全身 $150起）</li>
                  </ul>
                </div>

                {/* Top Dog & 單項服務 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="font-bold text-sky-800 mb-1">🐾 Top Dog</p>
                    <p className="text-gray-500 text-xs mb-1">不含洗澡及剪毛</p>
                    <p>剪甲 · 肛腺 · 刷牙 · 清耳 — <span className="font-medium">$30</span></p>
                  </div>
                  <div>
                    <p className="font-bold text-sky-800 mb-1">單項服務</p>
                    <p className="text-gray-500 text-xs mb-1">無需美容服務</p>
                    <ul className="space-y-0.5">
                      <li>剪指甲 — <span className="font-medium">$15</span></li>
                      <li>肛腺清潔 — <span className="font-medium">$15</span></li>
                      <li>腳底修剪 — <span className="font-medium">$10</span></li>
                      <li>刷牙 — <span className="font-medium">$10</span></li>
                      <li>清耳 — <span className="font-medium">$10</span></li>
                    </ul>
                  </div>
                </div>

              </div>
            </div>

            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <button onClick={handleServiceContinue}
              className="w-full mt-6 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors">繼續</button>
          </div>
        )}

        {/* ── STEP: DATE & TIME ── */}
        {step === 'datetime' && (
          <div className="p-6">
            <button onClick={() => setStep('service')} className="flex items-center text-sky-600 text-sm mb-4 hover:underline">
              <ChevronLeft className="w-4 h-4" /> 返回
            </button>
            <h2 className="text-xl font-bold text-sky-900 mb-1">
              <Calendar className="w-5 h-5 inline mr-2 text-sky-600" />選擇日期和時間
            </h2>
            <p className="text-sm text-gray-500 mb-5">營業日：{openDaysLabel}</p>
            {renderCalendar()}
            {selectedDate && (
              <div className="mt-6">
                <p className="text-sm font-semibold text-sky-800 mb-3 flex items-center gap-1">
                  <Clock className="w-4 h-4" />可預約時段 — {formatDate(selectedDate)}
                </p>
                {dateSlotsLoading ? (
                  <p className="text-sm text-gray-400 text-center py-4">查詢可用時段中…</p>
                ) : (() => {
                  const isSelectedToday = selectedDate?.toDateString() === today.toDateString()
                  const nowMins = isSelectedToday ? new Date().getHours() * 60 + new Date().getMinutes() : -1
                  const baseSlots = dateSlots ?? dynamicTimeSlots
                  const selectedServiceObj = dynamicServices.find(s => s.id === service)
                  const serviceDuration = selectedServiceObj?.durationMinutes || 0
                  const closingTimeMins = 16 * 60 + 30
                  const availableSlots = baseSlots.filter(t => {
                    if (isSelectedToday && parseTimeMins(t) <= nowMins) return false
                    return parseTimeMins(t) + serviceDuration <= closingTimeMins
                  })
                  return availableSlots.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {availableSlots.map(t => (
                        <button key={t} onClick={() => setSelectedTime(t)}
                          className={`py-2 rounded-xl text-sm font-medium border-2 transition-all ${selectedTime === t ? 'bg-sky-600 text-white border-sky-600' : 'border-gray-100 hover:border-sky-300 text-gray-700'}`}>
                          {t}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-3">此日期已約滿，請選擇其他日期。</p>
                  )
                })()}
              </div>
            )}
            {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
            <button onClick={handleDateTimeContinue} disabled={!selectedDate || !selectedTime}
              className="w-full mt-6 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">繼續</button>
          </div>
        )}

        {/* ── STEP: VACCINE & NOTES ── */}
        {step === 'vaccine-notes' && (
          <div className="p-6">
            <button onClick={() => setStep('datetime')} className="flex items-center text-sky-600 text-sm mb-4 hover:underline">
              <ChevronLeft className="w-4 h-4" /> 返回
            </button>
            <h2 className="text-xl font-bold text-sky-900 mb-1">疫苗記錄及備注</h2>
            <p className="text-sm text-gray-500 mb-5">新狗狗必須提供</p>
            {(isNewClient || isAddingNewPet || (selectedPet && selectedPet.vaccine_status === 'pending')) && (
              <div className="mb-6">
                <p className="text-sm font-semibold text-sky-800 mb-1">💉 疫苗記錄</p>
                <p className="text-xs text-gray-500 mb-3">必需：<strong>狂犬病</strong> + <strong>犬瘟熱</strong>或<strong>細小病毒</strong></p>
                <div className="space-y-3">
                  <div className={`upload-zone rounded-xl p-4 text-center cursor-pointer transition-all ${vaccineFile ? 'bg-green-50 border-green-400' : ''} ${vaccineEmailOnly || vaccineSmsOnly ? 'opacity-40 pointer-events-none' : ''}`}
                    onClick={() => !vaccineEmailOnly && !vaccineSmsOnly && fileInputRef.current?.click()}>
                    <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf"
                      onChange={e => { if (e.target.files?.[0]) { setVaccineFile(e.target.files[0]); setVaccineEmailOnly(false) } }} />
                    {vaccineFile ? (
                      <div className="flex items-center justify-center gap-2 text-green-700">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="text-sm font-medium">{vaccineFile.name}</span>
                      </div>
                    ) : (
                      <div>
                        <Upload className="w-6 h-6 text-sky-500 mx-auto mb-1" />
                        <p className="text-sm font-medium text-sky-700">上傳疫苗記錄</p>
                        <p className="text-xs text-gray-400 mt-0.5">JPG、PNG 或 PDF</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-gray-200" /><span className="text-xs text-gray-400">或</span><div className="flex-1 h-px bg-gray-200" />
                  </div>
                  <button onClick={() => { setVaccineEmailOnly(!vaccineEmailOnly); setVaccineSmsOnly(false); setVaccineFile(null) }}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${vaccineEmailOnly ? 'border-sky-500 bg-sky-50' : 'border-gray-100 hover:border-sky-200'}`}>
                    <Mail className="w-5 h-5 text-sky-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">我將以電子郵件傳送記錄</p>
                      <p className="text-xs text-gray-400 mt-0.5">kokonipets@gmail.com</p>
                    </div>
                    {vaccineEmailOnly && <CheckCircle2 className="w-5 h-5 text-sky-500 ml-auto" />}
                  </button>
                  <button onClick={() => { setVaccineSmsOnly(!vaccineSmsOnly); setVaccineEmailOnly(false); setVaccineFile(null) }}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${vaccineSmsOnly ? 'border-sky-500 bg-sky-50' : 'border-gray-100 hover:border-sky-200'}`}>
                    <Phone className="w-5 h-5 text-sky-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">我將以簡訊傳送記錄</p>
                      <p className="text-xs text-gray-400 mt-0.5">(626) 621-4646</p>
                    </div>
                    {vaccineSmsOnly && <CheckCircle2 className="w-5 h-5 text-sky-500 ml-auto" />}
                  </button>
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-sky-800 mb-2">特別說明 <span className="text-gray-400 font-normal">（選填）</span></label>
              <textarea placeholder="例：花生見到其他狗狗會緊張，請使用低速吹風機..." value={notes}
                onChange={e => setNotes(e.target.value)} rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none" />
            </div>
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <button onClick={handleVaccineContinue}
              className="w-full mt-6 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors">繼續</button>
          </div>
        )}

        {/* ── STEP: TERMS OF SERVICE ── */}
        {step === 'tos' && (
          <div className="p-6">
            <button onClick={() => setStep('vaccine-notes')} className="flex items-center text-sky-600 text-sm mb-4 hover:underline">
              <ChevronLeft className="w-4 h-4" /> 返回
            </button>
            <h2 className="text-xl font-bold text-sky-900 mb-1">服務條款</h2>
            <p className="text-sm text-gray-500 mb-4">提交預約前請仔細閱讀</p>
            <div className="bg-sky-50 rounded-xl p-4 mb-4 text-sm space-y-1">
              <p className="font-semibold text-sky-800">預約摘要</p>
              <p className="text-gray-600">🐾 {isNewClient || isAddingNewPet ? newPetName : selectedPet?.name}</p>
              <p className="text-gray-600">✂️ {dynamicServices.find(s => s.id === service)?.name}</p>
              <p className="text-gray-600">📅 {selectedDate ? formatDate(selectedDate) : ''} @ {selectedTime}</p>
            </div>
            <div ref={tosRef}
              className="tos-scroll h-52 overflow-y-auto border border-gray-200 rounded-xl p-4 text-xs text-gray-600 leading-relaxed bg-gray-50">
              {TERMS_OF_SERVICE_ZH_TW.split('\n').map((line, i) => (
                <p key={i} className={line === line.toUpperCase() && line.trim() && !/[一-鿿]/.test(line) ? 'font-bold text-gray-800 mt-3 mb-1' : line.length < 20 && line.trim() && /[一-鿿]/.test(line) ? 'font-bold text-gray-800 mt-3 mb-1' : 'mb-1'}>
                  {line || ' '}
                </p>
              ))}
            </div>
            <label className="flex items-start gap-3 mt-4 cursor-pointer">
              <input type="checkbox" checked={tosAgreed} onChange={e => setTosAgreed(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-sky-600 cursor-pointer flex-shrink-0" />
              <span className="text-sm text-gray-700">我已閱讀並同意<strong>服務條款</strong>。</span>
            </label>
            <label className="flex items-start gap-3 mt-3 cursor-pointer">
              <input type="checkbox" checked={smsConsentChecked} onChange={e => setSmsConsentChecked(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-sky-600 cursor-pointer flex-shrink-0" />
              <span className="text-sm text-gray-700">
                <strong>（選填）</strong>我同意以所提供的電話號碼接收 Kokoni Pet Grooming Salon 的預約相關簡訊通知。訊息頻率不定，可能產生訊息及數據費用。回覆 STOP 取消，HELP 取得協助。同意並非預約的必要條件。
              </span>
            </label>
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <button onClick={handleSubmit} disabled={!tosAgreed || loading}
              className="w-full mt-5 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {loading ? '提交中...' : '提交預約'}
            </button>
          </div>
        )}

        {/* ── STEP: CONFIRMED ── */}
        {step === 'confirmed' && (
          <div className="p-6 text-center">
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">📋</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">已收到您的預約申請！</h2>
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-5 py-4 mb-5 mt-3">
              <p className="text-amber-800 font-bold text-base">⚠️ 您的預約尚未確認。</p>
              <p className="text-amber-700 text-sm mt-1">我們將審核您的申請，確認後將以<strong>簡訊</strong>通知您。</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm text-left mb-4 space-y-2">
              <p className="font-semibold text-gray-700 mb-1">📝 您的預約</p>
              <div className="flex items-center gap-2 text-gray-600"><span>🐾</span><span>{isNewClient || isAddingNewPet ? newPetName : selectedPet?.name}</span></div>
              <div className="flex items-center gap-2 text-gray-600"><span>✂️</span><span>{dynamicServices.find(s => s.id === service)?.name}</span></div>
              <div className="flex items-center gap-2 text-gray-600"><span>📅</span><span>{selectedDate ? formatDate(selectedDate) : ''} @ {selectedTime}</span></div>
              <div className="flex items-center gap-2 text-gray-600"><span>📱</span><span>{phone}</span></div>
            </div>
            {needsVaccineEmail && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-800 mb-4 text-left">
                <p className="font-semibold mb-1">{vaccineContactMethod === 'text' ? '📱' : '📧'} 請注意</p>
                <p className="text-rose-700">
                  請以{vaccineContactMethod === 'text' ? '簡訊' : '電子郵件'}傳送您的疫苗記錄（狂犬病 + 犬瘟熱或細小病毒）至：
                </p>
                <p className="font-mono font-bold mt-1 text-rose-900">
                  {vaccineContactMethod === 'text' ? '(626) 621-4646' : 'kokonipets@gmail.com'}
                </p>
                <p className="text-xs mt-1.5 text-rose-600">我們收到記錄後才能確認您的預約。</p>
              </div>
            )}
            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-sm text-left mb-4">
              <p className="font-semibold text-sky-800 mb-2">💬 接下來是什麼？</p>
              <ol className="space-y-1.5 text-sky-700 list-none">
                <li className="flex items-start gap-2"><span className="font-bold">1.</span><span>我們審核您的申請（通常當天回覆）</span></li>
                <li className="flex items-start gap-2"><span className="font-bold">2.</span><span>您將收到確認<strong>簡訊</strong></span></li>
                <li className="flex items-start gap-2"><span className="font-bold">3.</span><span>確認後，預約即完成！🎉</span></li>
              </ol>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-400 mb-4">
              如需取消，請提前 24 小時通知，以避免每隻寵物 $30 的缺席費用。
            </div>
            <a href="/profile" className="block text-sm text-sky-600 hover:underline font-medium">👤 查看或更新我的個人資料 →</a>
            <p className="text-xs text-gray-400 mt-3">Kokoni Pet Grooming Salon • (626) 621-4646</p>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-6 text-center">Kokoni Pet Grooming Salon • (626) 621-4646</p>
    </div>
  )
}
