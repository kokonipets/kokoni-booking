'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type Tag = { id: string; name: string; color: string }

export const TAG_COLORS = ['sky','rose','amber','violet','emerald','teal','pink','gray','indigo','orange'] as const

export const TAG_STYLES: Record<string, string> = {
  sky:     'bg-sky-100 text-sky-700 border-sky-200',
  rose:    'bg-rose-100 text-rose-700 border-rose-200',
  amber:   'bg-amber-100 text-amber-700 border-amber-200',
  violet:  'bg-violet-100 text-violet-700 border-violet-200',
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  teal:    'bg-teal-100 text-teal-700 border-teal-200',
  pink:    'bg-pink-100 text-pink-700 border-pink-200',
  gray:    'bg-gray-100 text-gray-700 border-gray-200',
  indigo:  'bg-indigo-100 text-indigo-700 border-indigo-200',
  orange:  'bg-orange-100 text-orange-700 border-orange-200',
}

export function tagClasses(color: string) {
  return TAG_STYLES[color] || TAG_STYLES.sky
}

/** Small inline read-only tag pill. */
export function TagPill({ tag, onRemove, size = 'sm' }: { tag: Tag; onRemove?: () => void; size?: 'sm' | 'xs' }) {
  const px = size === 'xs' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-medium ${px} ${tagClasses(tag.color)}`}>
      {tag.name}
      {onRemove && (
        <button onClick={onRemove} className="hover:bg-black/10 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px] leading-none">✕</button>
      )}
    </span>
  )
}

/**
 * Dropdown tag picker. Shows a "+ Tag" button; click to open a popover listing
 * all available tags. Already-assigned tags are checked. Click toggles assignment.
 */
export function TagPicker({
  petId,
  currentTags,
  onChange,
}: {
  petId: string
  currentTags: Tag[]
  onChange: (tags: Tag[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open || allTags.length > 0) return
    setLoading(true)
    fetch('/api/admin/tags')
      .then(r => r.json())
      .then(d => setAllTags(d.tags || []))
      .finally(() => setLoading(false))
  }, [open, allTags.length])

  // Position the dropdown relative to the viewport (via a portal) so it can
  // never be clipped by an ancestor card's `overflow-hidden`.
  useEffect(() => {
    if (!open) return
    const update = () => {
      const rect = btnRef.current?.getBoundingClientRect()
      if (rect) setPos({ top: rect.bottom + 4, left: rect.left })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  const toggle = async (tag: Tag) => {
    const has = currentTags.some(t => t.id === tag.id)
    if (has) {
      await fetch('/api/admin/pet-tags', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pet_id: petId, tag_id: tag.id }),
      })
      onChange(currentTags.filter(t => t.id !== tag.id))
    } else {
      await fetch('/api/admin/pet-tags', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pet_id: petId, tag_id: tag.id }),
      })
      onChange([...currentTags, tag])
    }
  }

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-dashed border-gray-300 text-xs font-medium text-gray-500 hover:border-sky-400 hover:text-sky-600">
        + Tag
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[10000]" onClick={() => setOpen(false)} />
          <div
            style={{ position: 'fixed', top: pos.top, left: pos.left }}
            className="z-[10001] bg-white rounded-xl shadow-xl border border-gray-200 p-2 min-w-[200px] max-h-72 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-gray-400 px-2 py-1">Loading…</p>
            ) : allTags.length === 0 ? (
              <p className="text-xs text-gray-400 px-2 py-2">No tags yet. Create one in Settings.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {allTags.map(tag => {
                  const selected = currentTags.some(t => t.id === tag.id)
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggle(tag)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium text-left hover:bg-gray-50 ${selected ? 'bg-sky-50' : ''}`}>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 ${tagClasses(tag.color)}`}>{tag.name}</span>
                      {selected && <span className="ml-auto text-sky-600">✓</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
