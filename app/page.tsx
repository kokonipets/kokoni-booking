import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export default async function Home() {
  const headersList = await headers()
  const acceptLanguage = headersList.get('accept-language') || ''

  // Check for Chinese language preferences
  // Traditional Chinese: zh-TW, zh-HK, zh-Hant
  // Simplified Chinese: zh-CN, zh-SG, zh-Hans, zh (generic)
  const lang = acceptLanguage.toLowerCase()

  if (lang.includes('zh-tw') || lang.includes('zh-hk') || lang.includes('zh-hant')) {
    redirect('/book-zh-tw')
  } else if (lang.includes('zh-cn') || lang.includes('zh-sg') || lang.includes('zh-hans') || lang.includes('zh-')) {
    redirect('/book-zh-cn')
  } else {
    redirect('/book')
  }
}
