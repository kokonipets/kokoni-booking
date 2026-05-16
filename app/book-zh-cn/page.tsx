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
  { id: 'simply_cute', name: '简单可爱 – 日常造型', desc: '经典修剪、洗澡、吹干及最后修饰', icon: '✂️', durationMinutes: 120 },
  { id: 'bath_brush', name: '洗澡梳毛', desc: '全面洗澡、吹干及梳毛', icon: '🛁', durationMinutes: 120 },
  { id: 'asian_fusion', name: '亚洲混搭造型', desc: '带有现代亚洲风格的创意造型', icon: '🌸', durationMinutes: 180 },
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

const TERMS_OF_SERVICE_ZH_CN = `Kokoni Grooming Salon — 服务条款

资料披露
美容对宠物而言可能造成压力，长期不进行美容更可能对您的宠物造成严重不适。请务必告知美容师您的宠物任何已知的健康问题、近期兽医就诊记录或美容问题，以便美容师随时注意异常迹象。

若您未告知任何过敏或皮肤问题，Kokoni 对于因美容过程而引起的任何刺激、脱毛、擦伤或毛发损失不承担责任。

若您未告知任何身体或医疗状况（如肘部或髋部发育不良、癫痫等），Kokoni 对于美容过程中发生的任何伤害不承担责任。

客户同意 Kokoni 及其所有者和经营者对美容期间发现的任何既有状况或问题不承担责任，且宠物主人同意承担因此产生的所有医疗费用。

跳蚤与蜱虫
若在美容过程中发现您的宠物有跳蚤和／或蜱虫，治疗费用将强制由饲主负担，并另收取额外费用。

毛结与去毛结
所有毛发严重打结的宠物均需收取「去毛结费用」。去除严重打结的毛发可能有切伤、割伤或擦伤的风险。作为宠物的主人，您同意 Kokoni 对于因去除打结／疏于护理的毛发而造成的任何切割／割伤／擦伤或美容后的影响不承担责任。

攻击性宠物
饲主必须告知美容师您的宠物是否可能咬人、曾经咬过人或有攻击行为迹象。对于具攻击性或难以美容的宠物，可能会收取额外的处理费用。Kokoni 保留在任何时候拒绝或停止服务的权利。

晚接宠物
若您的宠物未能在下午 5:00 关门前被接回，每超过 30 分钟将收取 $25 的晚接费用。

未到店及取消预约
未到店及多次临时取消预约者，每只宠物需支付 $30 的缺席费用。请提前 24 小时通知我们。如需再次预约，可能需要预付款项。

疫苗接种
所有宠物必须按时接种所有疫苗，包括狂犬病及犬瘟热或细小病毒疫苗。您可以直接在本表单上传记录，或发送电子邮件至 kokonipets@gmail.com。

视觉授权及使用
在店内停留或美容期间拍摄的宠物图像、照片和影片，以及其名称，可由本店以任何形式或格式用于任何媒体、营销、广告或促销材料中。`

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
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
}
function formatDateShort(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
}

const STEPS_ORDER: Step[] = ['phone', 'new-client', 'select-pet', 'service', 'datetime', 'vaccine-notes', 'tos', 'confirmed']

export default function BookPageZhCn() {
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
  const [openDaysLabel, setOpenDaysLabel] = useState('周一至周六')
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
          setOpenDaysLabel(data.open_days.map((d: number) => '周' + DAY_ZH[d]).join('、'))
        }
        if (Array.isArray(data.blocked_dates)) setBlockedDates(data.blocked_dates)
        if (data.time_slots && data.time_slots.length > 0) setDynamicTimeSlots(data.time_slots)
        if (data.services && data.services.length > 0) {
          const withDurations = data.services.map((s: any) => {
            const serviceDef = SERVICES.find(srv => srv.id === s.id)
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
      setError('请输入有效的10位数电话号码。')
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
      setError('发生错误，请重试。')
    } finally {
      setLoading(false)
    }
  }

  const handleNewClientContinue = () => {
    if (!newClientFirstName.trim()) { setError('请输入您的名字。'); return }
    if (!newPetName.trim()) { setError('请输入狗狗的名字。'); return }
    if (!newPetWeight) { setError('请选择狗狗的体重范围。'); return }
    setError('')
    const fullName = `${newClientFirstName.trim()} ${newClientLastName.trim()}`.trim()
    setNewClientName(fullName)
    setClientName(fullName)
    setStep('service')
  }

  const uploadPetPhoto = async (petId: string, file: File) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
      setError('请使用 JPG、PNG 或 WEBP 格式的照片。')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('照片过大（最大 50 MB），请选择较小的文件。')
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
        setError(data.error || '照片上传失败，请重试。')
      }
    } catch {
      setError('照片上传失败，请重试。')
    } finally {
      setUploadingPetPhotoId(null)
    }
  }

  const handlePetContinue = () => {
    if (!selectedPet && !isAddingNewPet) { setError('请选择狗狗或添加一只新狗狗。'); return }
    if (isAddingNewPet && !newPetName.trim()) { setError('请输入狗狗的名字。'); return }
    if (isAddingNewPet && !newPetWeight) { setError('请选择狗狗的体重范围。'); return }
    setError('')
    setStep('service')
  }

  const handleServiceContinue = () => {
    if (!service) { setError('请选择服务项目。'); return }
    setError('')
    setStep('datetime')
  }

  const handleDateTimeContinue = () => {
    if (!selectedDate) { setError('请选择日期。'); return }
    if (!selectedTime) { setError('请选择时间。'); return }
    setError('')
    setStep('vaccine-notes')
  }

  const handleVaccineContinue = () => {
    const petNeedsVaccine = isNewClient || isAddingNewPet ||
      (selectedPet && selectedPet.vaccine_status === 'pending')
    if (petNeedsVaccine && !vaccineFile && !vaccineEmailOnly && !vaccineSmsOnly) {
      setError('请上传疫苗记录，或选择以电子邮件／短信发送。')
      return
    }
    setError('')
    setStep('tos')
  }

  const handleSubmit = async () => {
    if (!tosAgreed) { setError('请同意服务条款。'); return }
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
      if (!res.ok) throw new Error(data.error || '预约失败')
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
      setError(e instanceof Error ? e.message : '发生错误，请重试。')
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
    const monthName = calMonth.toLocaleString('zh-CN', { month: 'long', year: 'numeric' })
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
                title={isToday ? '今天' : isBlockedDate ? '不可预约' : isClosed ? '休息日' : ''}
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
        <p className="text-sm text-sky-600 font-medium">在线预约</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-gray-400">语言：</span>
          <a href="/book" className="text-xs text-gray-500 hover:text-sky-600 px-2 py-0.5 rounded-full hover:bg-sky-50 transition-colors">English</a>
          <a href="/book-zh-tw" className="text-xs text-gray-500 hover:text-sky-600 px-2 py-0.5 rounded-full hover:bg-sky-50 transition-colors">繁體中文</a>
          <span className="text-xs font-semibold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">简体中文</span>
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
            <h2 className="text-xl font-bold text-sky-900 mb-1">预约美容</h2>
            <p className="text-sm text-gray-500 mb-6">请输入您的电话号码以开始预约</p>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Phone className="w-4 h-4 inline mr-1 text-sky-600" />电话号码
            </label>
            <input
              type="tel" placeholder="(949) 000-0000" value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && handlePhoneLookup()}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg tracking-wide focus:outline-none focus:ring-2 focus:ring-sky-400 mb-4"
            />
            <div className="mt-4 p-3 bg-sky-50 border border-sky-100 rounded-xl">
              <p className="text-xs text-gray-600 leading-relaxed">
                <strong>选填：</strong>勾选下方方框，即代表您同意通过短信接收来自 <strong>Kokoni Pet Grooming Salon</strong> 的预约确认、提醒及取件通知。消息频率不定（每次预约约 2–5 条）。可能会产生消息及数据费用。回复 <strong>STOP</strong> 取消订阅，<strong>HELP</strong> 获取帮助。请参阅我们的{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-sky-600 underline">隐私政策</a>及{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-sky-600 underline">服务条款</a>。
                <strong>同意接收短信并非预约的必要条件。</strong>
              </p>
            </div>
            <label className="flex items-start gap-3 mt-4 cursor-pointer">
              <input type="checkbox" checked={smsConsentChecked} onChange={e => setSmsConsentChecked(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-sky-600 cursor-pointer flex-shrink-0" />
              <span className="text-xs text-gray-700 leading-relaxed">
                <strong>（选填）</strong>我同意依上述说明接收 Kokoni Pet Grooming Salon 的短信预约通知。
              </span>
            </label>
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <button onClick={handlePhoneLookup} disabled={loading}
              className="w-full mt-4 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {loading ? '查询中...' : '继续'}
            </button>
            <div className="mt-4 pt-4 border-t border-gray-100 text-center">
              <a href="/profile" className="text-sm text-sky-600 hover:underline">👤 查看我的个人资料及预约 →</a>
            </div>
          </div>
        )}

        {/* ── STEP: NEW CLIENT ── */}
        {step === 'new-client' && (
          <div className="p-6">
            <button onClick={() => setStep('phone')} className="flex items-center text-sky-600 text-sm mb-4 hover:underline">
              <ChevronLeft className="w-4 h-4" /> 返回
            </button>
            <h2 className="text-xl font-bold text-sky-900 mb-1">欢迎！让我们为您建立资料</h2>
            <p className="text-sm text-gray-500 mb-5">第一次来吗？很高兴认识您！</p>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">电子邮件 <span className="text-gray-400">（选填）</span></label>
                <input type="email" placeholder="you@email.com" value={newClientEmail}
                  onChange={e => setNewClientEmail(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-400" />
              </div>
              <hr className="border-gray-100" />
              <p className="text-sm font-semibold text-sky-800">🐾 您的狗狗</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">狗狗名字 <span className="text-rose-500">*</span></label>
                <input type="text" placeholder="例：花生" value={newPetName}
                  onChange={e => setNewPetName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">品种 <span className="text-gray-400">（选填）</span></label>
                <BreedInput value={newPetBreed} onChange={setNewPetBreed} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">体重 <span className="text-rose-500">*</span></label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">生日 <span className="text-gray-400">（选填）</span></label>
                <input type="date" value={newPetBirthday} onChange={e => setNewPetBirthday(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-400" />
              </div>
            </div>
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <button onClick={handleNewClientContinue}
              className="w-full mt-6 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors">继续</button>
          </div>
        )}

        {/* ── STEP: SELECT PET ── */}
        {step === 'select-pet' && (
          <div className="p-6">
            <button onClick={() => setStep('phone')} className="flex items-center text-sky-600 text-sm mb-4 hover:underline">← 返回</button>
            <h2 className="text-xl font-bold text-sky-900 mb-1">
              {clientName && !/^\d+$/.test(clientName.trim()) ? `您好，${clientName.split(' ')[0]}！👋` : '您好！👋'}
            </h2>
            <p className="text-sm text-gray-500 mb-5">今天哪只狗狗要来美容？</p>
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
                        {uploadingPetPhotoId === pet.id ? '上传中...' : uploadDonePetId === pet.id ? '✓ 完成！' : '📷 更新照片'}
                        <input type="file" accept="image/*" className="hidden" disabled={uploadingPetPhotoId === pet.id}
                          onChange={e => { const file = e.target.files?.[0]; if (file) uploadPetPhoto(pet.id, file) }} />
                      </label>
                      <span className="text-xs text-gray-400">{pet.photo_url ? '更换照片' : '添加照片'}</span>
                    </div>
                  )}
                </div>
              ))}
              <button onClick={() => { setIsAddingNewPet(true); setSelectedPet(null) }}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${isAddingNewPet ? 'border-sky-500 bg-sky-50' : 'border-dashed border-gray-200 hover:border-sky-300'}`}>
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl">➕</div>
                <p className="font-medium text-gray-600">添加一只狗狗</p>
                {isAddingNewPet && <CheckCircle2 className="w-5 h-5 text-sky-500 ml-auto" />}
              </button>
            </div>
            {isAddingNewPet && (
              <div className="mt-4 space-y-3">
                <input type="text" placeholder="狗狗名字 *" value={newPetName} onChange={e => setNewPetName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sky-400" />
                <BreedInput value={newPetBreed} onChange={setNewPetBreed} />
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">体重 <span className="text-rose-500">*</span></p>
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
                  <p className="text-sm font-medium text-gray-700 mb-1">生日 <span className="text-gray-400">（选填）</span></p>
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
                    <p className="text-sm font-medium text-sky-600">{newPetPhotoFile ? newPetPhotoFile.name : '添加照片（选填）'}</p>
                    <p className="text-xs text-gray-400">点击选择您的狗狗照片</p>
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
              className="w-full mt-6 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors">继续</button>
          </div>
        )}

        {/* ── STEP: SERVICE ── */}
        {step === 'service' && (
          <div className="p-6">
            <button onClick={() => setStep(isNewClient ? 'new-client' : 'select-pet')} className="flex items-center text-sky-600 text-sm mb-4 hover:underline">
              <ChevronLeft className="w-4 h-4" /> 返回
            </button>
            <h2 className="text-xl font-bold text-sky-900 mb-1">
              <Scissors className="w-5 h-5 inline mr-2 text-sky-600" />选择服务
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              为 {isNewClient ? newPetName : (isAddingNewPet ? newPetName : selectedPet?.name)} 选择
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
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <button onClick={handleServiceContinue}
              className="w-full mt-6 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors">继续</button>
          </div>
        )}

        {/* ── STEP: DATE & TIME ── */}
        {step === 'datetime' && (
          <div className="p-6">
            <button onClick={() => setStep('service')} className="flex items-center text-sky-600 text-sm mb-4 hover:underline">
              <ChevronLeft className="w-4 h-4" /> 返回
            </button>
            <h2 className="text-xl font-bold text-sky-900 mb-1">
              <Calendar className="w-5 h-5 inline mr-2 text-sky-600" />选择日期和时间
            </h2>
            <p className="text-sm text-gray-500 mb-5">营业日：{openDaysLabel}</p>
            {renderCalendar()}
            {selectedDate && (
              <div className="mt-6">
                <p className="text-sm font-semibold text-sky-800 mb-3 flex items-center gap-1">
                  <Clock className="w-4 h-4" />可预约时段 — {formatDate(selectedDate)}
                </p>
                {dateSlotsLoading ? (
                  <p className="text-sm text-gray-400 text-center py-4">查询可用时段中…</p>
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
                    <p className="text-sm text-gray-400 text-center py-3">此日期已约满，请选择其他日期。</p>
                  )
                })()}
              </div>
            )}
            {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
            <button onClick={handleDateTimeContinue} disabled={!selectedDate || !selectedTime}
              className="w-full mt-6 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">继续</button>
          </div>
        )}

        {/* ── STEP: VACCINE & NOTES ── */}
        {step === 'vaccine-notes' && (
          <div className="p-6">
            <button onClick={() => setStep('datetime')} className="flex items-center text-sky-600 text-sm mb-4 hover:underline">
              <ChevronLeft className="w-4 h-4" /> 返回
            </button>
            <h2 className="text-xl font-bold text-sky-900 mb-1">疫苗记录及备注</h2>
            <p className="text-sm text-gray-500 mb-5">新狗狗必须提供</p>
            {(isNewClient || isAddingNewPet || (selectedPet && selectedPet.vaccine_status === 'pending')) && (
              <div className="mb-6">
                <p className="text-sm font-semibold text-sky-800 mb-1">💉 疫苗记录</p>
                <p className="text-xs text-gray-500 mb-3">必需：<strong>狂犬病</strong> + <strong>犬瘟热</strong>或<strong>细小病毒</strong></p>
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
                        <p className="text-sm font-medium text-sky-700">上传疫苗记录</p>
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
                      <p className="text-sm font-medium text-gray-800">我将以电子邮件发送记录</p>
                      <p className="text-xs text-gray-400 mt-0.5">kokonipets@gmail.com</p>
                    </div>
                    {vaccineEmailOnly && <CheckCircle2 className="w-5 h-5 text-sky-500 ml-auto" />}
                  </button>
                  <button onClick={() => { setVaccineSmsOnly(!vaccineSmsOnly); setVaccineEmailOnly(false); setVaccineFile(null) }}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${vaccineSmsOnly ? 'border-sky-500 bg-sky-50' : 'border-gray-100 hover:border-sky-200'}`}>
                    <Phone className="w-5 h-5 text-sky-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">我将以短信发送记录</p>
                      <p className="text-xs text-gray-400 mt-0.5">(626) 621-4646</p>
                    </div>
                    {vaccineSmsOnly && <CheckCircle2 className="w-5 h-5 text-sky-500 ml-auto" />}
                  </button>
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-sky-800 mb-2">特别说明 <span className="text-gray-400 font-normal">（选填）</span></label>
              <textarea placeholder="例：花生见到其他狗狗会紧张，请使用低速吹风机..." value={notes}
                onChange={e => setNotes(e.target.value)} rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none" />
            </div>
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <button onClick={handleVaccineContinue}
              className="w-full mt-6 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors">继续</button>
          </div>
        )}

        {/* ── STEP: TERMS OF SERVICE ── */}
        {step === 'tos' && (
          <div className="p-6">
            <button onClick={() => setStep('vaccine-notes')} className="flex items-center text-sky-600 text-sm mb-4 hover:underline">
              <ChevronLeft className="w-4 h-4" /> 返回
            </button>
            <h2 className="text-xl font-bold text-sky-900 mb-1">服务条款</h2>
            <p className="text-sm text-gray-500 mb-4">提交预约前请仔细阅读</p>
            <div className="bg-sky-50 rounded-xl p-4 mb-4 text-sm space-y-1">
              <p className="font-semibold text-sky-800">预约摘要</p>
              <p className="text-gray-600">🐾 {isNewClient || isAddingNewPet ? newPetName : selectedPet?.name}</p>
              <p className="text-gray-600">✂️ {dynamicServices.find(s => s.id === service)?.name}</p>
              <p className="text-gray-600">📅 {selectedDate ? formatDate(selectedDate) : ''} @ {selectedTime}</p>
            </div>
            <div ref={tosRef}
              className="tos-scroll h-52 overflow-y-auto border border-gray-200 rounded-xl p-4 text-xs text-gray-600 leading-relaxed bg-gray-50">
              {TERMS_OF_SERVICE_ZH_CN.split('\n').map((line, i) => (
                <p key={i} className={line === line.toUpperCase() && line.trim() && !/[一-鿿]/.test(line) ? 'font-bold text-gray-800 mt-3 mb-1' : line.length < 20 && line.trim() && /[一-鿿]/.test(line) ? 'font-bold text-gray-800 mt-3 mb-1' : 'mb-1'}>
                  {line || ' '}
                </p>
              ))}
            </div>
            <label className="flex items-start gap-3 mt-4 cursor-pointer">
              <input type="checkbox" checked={tosAgreed} onChange={e => setTosAgreed(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-sky-600 cursor-pointer flex-shrink-0" />
              <span className="text-sm text-gray-700">我已阅读并同意<strong>服务条款</strong>。</span>
            </label>
            <label className="flex items-start gap-3 mt-3 cursor-pointer">
              <input type="checkbox" checked={smsConsentChecked} onChange={e => setSmsConsentChecked(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-sky-600 cursor-pointer flex-shrink-0" />
              <span className="text-sm text-gray-700">
                <strong>（选填）</strong>我同意以所提供的电话号码接收 Kokoni Pet Grooming Salon 的预约相关短信通知。消息频率不定，可能产生消息及数据费用。回复 STOP 取消，HELP 获取帮助。同意并非预约的必要条件。
              </span>
            </label>
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <button onClick={handleSubmit} disabled={!tosAgreed || loading}
              className="w-full mt-5 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {loading ? '提交中...' : '提交预约'}
            </button>
          </div>
        )}

        {/* ── STEP: CONFIRMED ── */}
        {step === 'confirmed' && (
          <div className="p-6 text-center">
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">📋</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">已收到您的预约申请！</h2>
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-5 py-4 mb-5 mt-3">
              <p className="text-amber-800 font-bold text-base">⚠️ 您的预约尚未确认。</p>
              <p className="text-amber-700 text-sm mt-1">我们将审核您的申请，确认后将以<strong>短信</strong>通知您。</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm text-left mb-4 space-y-2">
              <p className="font-semibold text-gray-700 mb-1">📝 您的预约</p>
              <div className="flex items-center gap-2 text-gray-600"><span>🐾</span><span>{isNewClient || isAddingNewPet ? newPetName : selectedPet?.name}</span></div>
              <div className="flex items-center gap-2 text-gray-600"><span>✂️</span><span>{dynamicServices.find(s => s.id === service)?.name}</span></div>
              <div className="flex items-center gap-2 text-gray-600"><span>📅</span><span>{selectedDate ? formatDate(selectedDate) : ''} @ {selectedTime}</span></div>
              <div className="flex items-center gap-2 text-gray-600"><span>📱</span><span>{phone}</span></div>
            </div>
            {needsVaccineEmail && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-800 mb-4 text-left">
                <p className="font-semibold mb-1">{vaccineContactMethod === 'text' ? '📱' : '📧'} 请注意</p>
                <p className="text-rose-700">
                  请以{vaccineContactMethod === 'text' ? '短信' : '电子邮件'}发送您的疫苗记录（狂犬病 + 犬瘟热或细小病毒）至：
                </p>
                <p className="font-mono font-bold mt-1 text-rose-900">
                  {vaccineContactMethod === 'text' ? '(626) 621-4646' : 'kokonipets@gmail.com'}
                </p>
                <p className="text-xs mt-1.5 text-rose-600">我们收到记录后才能确认您的预约。</p>
              </div>
            )}
            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-sm text-left mb-4">
              <p className="font-semibold text-sky-800 mb-2">💬 接下来是什么？</p>
              <ol className="space-y-1.5 text-sky-700 list-none">
                <li className="flex items-start gap-2"><span className="font-bold">1.</span><span>我们审核您的申请（通常当天回复）</span></li>
                <li className="flex items-start gap-2"><span className="font-bold">2.</span><span>您将收到确认<strong>短信</strong></span></li>
                <li className="flex items-start gap-2"><span className="font-bold">3.</span><span>确认后，预约即完成！🎉</span></li>
              </ol>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-400 mb-4">
              如需取消，请提前 24 小时通知，以避免每只宠物 $30 的缺席费用。
            </div>
            <a href="/profile" className="block text-sm text-sky-600 hover:underline font-medium">👤 查看或更新我的个人资料 →</a>
            <p className="text-xs text-gray-400 mt-3">Kokoni Pet Grooming Salon • (626) 621-4646</p>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-6 text-center">Kokoni Pet Grooming Salon • (626) 621-4646</p>
    </div>
  )
}
