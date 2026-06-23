'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Hero photo changes on this cadence; folder is re-checked for new photos
// periodically so staff can drop in photos without touching the TV.
const SLIDE_MS = 6000
const TAGLINE_MS = 7500
const REFRESH_MS = 5 * 60 * 1000

// Headline copy from the Kokoni website.
const TAGLINES: { title: string; sub: string }[] = [
  { title: 'More Than a Haircut—It’s Care', sub: 'We do it the KOKONI way. 🐾' },
  { title: 'Safety First. Comfort Always.', sub: 'Gentle, stress-free grooming.' },
  { title: 'Gentle Experiences, Happy Pets', sub: 'Trust · Comfort · Connection' },
]

export default function WindowDisplay() {
  const [photos, setPhotos] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [slotA, setSlotA] = useState<string | null>(null)
  const [slotB, setSlotB] = useState<string | null>(null)
  const [active, setActive] = useState<'A' | 'B'>('A')
  const [tagIdx, setTagIdx] = useState(0)
  const [tagShown, setTagShown] = useState(true)

  const photosRef = useRef<string[]>([])
  const idxRef = useRef(0)
  const activeRef = useRef<'A' | 'B'>('A')
  const initedRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/window/photos', { cache: 'no-store' })
      const d = await r.json()
      const list: string[] = Array.isArray(d.photos) ? d.photos : []
      photosRef.current = list
      setPhotos(list)
    } catch {
      /* keep current */
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    load()
    const iv = setInterval(load, REFRESH_MS)
    return () => clearInterval(iv)
  }, [load])

  // Seed hero slots once photos arrive.
  useEffect(() => {
    if (!initedRef.current && photos.length > 0) {
      initedRef.current = true
      idxRef.current = 0
      setSlotA(photos[0])
      setSlotB(photos[1 % photos.length] ?? photos[0])
      setActive('A')
      activeRef.current = 'A'
    }
  }, [photos])

  // Advance hero photo (inactive slot always preloads the next one).
  useEffect(() => {
    if (photos.length < 2) return
    const iv = setInterval(() => {
      const list = photosRef.current
      if (list.length < 2) return
      const next = (idxRef.current + 1) % list.length
      idxRef.current = next
      const newActive = activeRef.current === 'A' ? 'B' : 'A'
      activeRef.current = newActive
      setActive(newActive)
      const following = (next + 1) % list.length
      if (newActive === 'A') setSlotB(list[following])
      else setSlotA(list[following])
    }, SLIDE_MS)
    return () => clearInterval(iv)
  }, [photos.length])

  // Rotate the headline copy with a fade.
  useEffect(() => {
    const iv = setInterval(() => {
      setTagShown(false)
      setTimeout(() => {
        setTagIdx(i => (i + 1) % TAGLINES.length)
        setTagShown(true)
      }, 500)
    }, TAGLINE_MS)
    return () => clearInterval(iv)
  }, [])

  const hasPhotos = !!(slotA || slotB)
  const tag = TAGLINES[tagIdx]

  return (
    <div className="fixed inset-0 overflow-hidden cursor-none select-none flex flex-col"
      style={{ height: '100dvh', background: 'linear-gradient(165deg,#f4fafe 0%,#e2f0fd 50%,#eef6fd 100%)' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap');
        @keyframes kb { 0%{transform:scale(1.03) translate(0,0)} 100%{transform:scale(1.13) translate(-2%,-2%)} }
        @keyframes floaty { 0%{transform:translateY(0) rotate(-3deg)} 100%{transform:translateY(-12px) rotate(3deg)} }
        @keyframes pop { 0%{transform:scale(0) rotate(-10deg)} 70%{transform:scale(1.12) rotate(-10deg)} 100%{transform:scale(1) rotate(-10deg)} }
        @keyframes badgepulse { 0%,100%{transform:scale(1) rotate(-10deg)} 50%{transform:scale(1.07) rotate(-10deg)} }
      `}</style>

      {/* Top accent bar */}
      <div className="h-[10px] w-full shrink-0" style={{ background: 'linear-gradient(90deg,#7fd0e8,#2f9fd4,#1c4f95)' }} />

      {/* ── HEADLINE (top) ── */}
      <header className="shrink-0 text-center px-[6vw] pt-[3.2vh] pb-[2vh]">
        <div className={`transition-all duration-500 ${tagShown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
          <h1 className="leading-[1.05] text-[#1c4f95]"
            style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 'clamp(40px,6vh,92px)', textWrap: 'balance' }}>
            {tag.title}
          </h1>
          <p className="mt-[1.2vh] text-[#3b6fb0] font-semibold tracking-wide" style={{ fontSize: 'clamp(20px,2.7vh,42px)' }}>
            {tag.sub}
          </p>
        </div>
      </header>

      {/* ── HERO PHOTO (middle) ── */}
      <main className="flex-1 min-h-0 px-[5vw]">
        <div className="relative h-full w-full rounded-[2.5rem] overflow-hidden shadow-2xl ring-1 ring-black/5 bg-sky-100">
          {/* First-time promo sticker */}
          <div className="absolute z-20 bottom-[3%] right-[3%] rounded-full flex flex-col items-center justify-center text-center text-white shadow-2xl"
            style={{
              width: 'clamp(130px,23vw,240px)', aspectRatio: '1',
              background: 'radial-gradient(circle at 35% 30%, #ffb24d, #f1730d 72%)',
              border: '5px solid rgba(255,255,255,0.9)',
              animation: 'pop .7s cubic-bezier(.34,1.56,.64,1) both, badgepulse 2.4s ease-in-out .7s infinite',
            }}>
            <span className="font-black leading-none" style={{ fontSize: 'clamp(34px,6vw,72px)' }}>20%</span>
            <span className="font-black leading-none tracking-wider" style={{ fontSize: 'clamp(18px,3vw,38px)' }}>OFF</span>
            <span className="font-bold uppercase mt-[0.35em] leading-[1.05] tracking-[0.1em]" style={{ fontSize: 'clamp(12px,1.9vw,24px)' }}>First<br />Groom</span>
          </div>

          {hasPhotos ? (
            <>
              <img key={`A-${slotA}`} src={slotA ?? ''} alt=""
                className={`absolute inset-0 w-full h-full object-cover transition-opacity ease-in-out ${active === 'A' ? 'opacity-100' : 'opacity-0'}`}
                style={{ transitionDuration: '1200ms', animation: active === 'A' ? `kb ${(SLIDE_MS + 1200) / 1000}s ease-out forwards` : 'none' }} />
              <img key={`B-${slotB}`} src={slotB ?? ''} alt=""
                className={`absolute inset-0 w-full h-full object-cover transition-opacity ease-in-out ${active === 'B' ? 'opacity-100' : 'opacity-0'}`}
                style={{ transitionDuration: '1200ms', animation: active === 'B' ? `kb ${(SLIDE_MS + 1200) / 1000}s ease-out forwards` : 'none' }} />
            </>
          ) : (
            loaded && (
              <div className="absolute inset-0 flex items-center justify-center text-center px-12">
                <p className="text-sky-700/70 text-2xl font-semibold max-w-xl">
                  Add photos to the <span className="font-mono bg-sky-100 px-2 py-0.5 rounded">/public/window</span> folder to display them here.
                </p>
              </div>
            )
          )}
        </div>
      </main>

      {/* ── BRAND / BOOKING BAND (bottom) ── */}
      <footer className="shrink-0 px-[5vw] pt-[2.2vh] pb-[3.5vh]">
        <div className="rounded-[2rem] bg-white/95 shadow-xl ring-1 ring-black/5 px-[5vw] py-[2.4vh] flex items-center justify-between gap-[4vw]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Kokoni Pet Grooming Salon" className="h-[8vh] max-h-[120px] w-auto object-contain" />
          <div className="flex items-center gap-[3vw]">
            <div className="text-right">
              <p className="text-[#1c4f95] font-black leading-tight" style={{ fontSize: 'clamp(18px,2.6vh,38px)' }}>Scan to Book</p>
              <p className="text-[#3b6fb0] font-semibold" style={{ fontSize: 'clamp(13px,1.7vh,24px)' }}>Walk-ins welcome 🐾</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/qr-kokonipets.png" alt="Scan to book" className="h-[11vh] max-h-[160px] w-auto rounded-xl" />
          </div>
        </div>
      </footer>
    </div>
  )
}
