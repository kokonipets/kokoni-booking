import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

// Detect whether text is primarily Chinese (any Chinese Unicode block)
function isChinese(text: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f]/.test(text)
}

// Single MyMemory call helper
async function myMemoryTranslate(text: string, from: string, to: string): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.responseStatus === 200) {
    const result = data.responseData.translatedText as string
    // Validate translation quality — reject if it looks like garbage
    // (e.g. random characters that don't match expected language)
    if (to === 'en' && result.length > 0) {
      const alphaRatio = (result.match(/[a-zA-Z\s]/g) || []).length / result.length
      if (alphaRatio < 0.5) throw new Error('Translation quality too low')
    }
    return result
  }
  throw new Error(`MyMemory error: ${data.responseStatus}`)
}

// AI-powered 3-way translation: English ↔ Traditional Chinese ↔ Simplified Chinese
// Auto-detects input language, returns all 3 versions
export async function POST(req: NextRequest) {
  const { text } = await req.json()

  if (!text || !text.trim()) {
    return NextResponse.json({ error: 'Text is required' }, { status: 400 })
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY

  // ── Claude AI path (best quality) ───────────────────────────────────
  if (anthropicKey) {
    try {
      const systemPrompt = `You are a professional translator for a pet grooming salon.
Given any text in English, Traditional Chinese (繁體中文), or Simplified Chinese (简体中文),
return ONLY a raw JSON object (no markdown, no code fences) with all three translations.

Rules:
- Detect the input language automatically
- For the detected language, copy the original text exactly as-is
- Translate accurately into the other two languages
- Keep translations natural and concise

Required JSON format (output ONLY this, nothing else before or after):
{"english":"...","traditional":"...","simplified":"...","detected":"english"}`

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          system: systemPrompt,
          messages: [{ role: 'user', content: text }],
        }),
      })

      const apiData = await response.json()
      if (apiData.content?.[0]?.text) {
        const raw = apiData.content[0].text.trim()
        // Strip any accidental markdown fences
        const jsonStr = raw
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim()
        const parsed = JSON.parse(jsonStr)
        if (parsed.english && parsed.traditional && parsed.simplified) {
          return NextResponse.json({
            success: true,
            english: parsed.english,
            traditional: parsed.traditional,
            simplified: parsed.simplified,
            detected: parsed.detected || 'unknown',
            provider: 'claude',
          })
        }
      }
    } catch (err) {
      console.error('Claude translation error:', err)
      // Fall through to MyMemory
    }
  }

  // ── MyMemory fallback: auto-detect language, 3-way via parallel calls ─
  try {
    const chinese = isChinese(text)

    if (chinese) {
      // Input is Chinese — translate to English, and cross-translate for Simplified
      // zh-TW → en, then en → zh-CN
      const [english, simplified] = await Promise.all([
        myMemoryTranslate(text, 'zh-TW', 'en'),
        myMemoryTranslate(text, 'zh-TW', 'zh-CN'),
      ])
      return NextResponse.json({
        success: true,
        english,
        traditional: text,  // input is the traditional (or simplified — keep original)
        simplified,
        detected: 'traditional',
        provider: 'mymemory',
      })
    } else {
      // Input is English — translate to Traditional + Simplified
      const [traditional, simplified] = await Promise.all([
        myMemoryTranslate(text, 'en', 'zh-TW'),
        myMemoryTranslate(text, 'en', 'zh-CN'),
      ])
      return NextResponse.json({
        success: true,
        english: text,
        traditional,
        simplified,
        detected: 'english',
        provider: 'mymemory',
      })
    }
  } catch (error) {
    console.error('MyMemory translation error:', error)
  }

  return NextResponse.json({
    error: 'Translation service unavailable',
    english: '', traditional: '', simplified: '', detected: 'unknown',
  }, { status: 500 })
}
