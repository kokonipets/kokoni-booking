import SmsModeBanner from '@/components/SmsModeBanner'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SmsModeBanner />
      {children}
    </>
  )
}
