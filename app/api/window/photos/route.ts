import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'])

// GET /api/window/photos — list image files dropped into /public/window
// so the window display auto-discovers them (no code change needed to add photos).
export async function GET() {
  try {
    const dir = path.join(process.cwd(), 'public', 'window')
    const files = fs.readdirSync(dir)
      .filter(f => !f.startsWith('.') && IMAGE_EXT.has(path.extname(f).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .map(f => `/window/${encodeURIComponent(f)}`)
    return NextResponse.json({ photos: files })
  } catch {
    return NextResponse.json({ photos: [] })
  }
}
