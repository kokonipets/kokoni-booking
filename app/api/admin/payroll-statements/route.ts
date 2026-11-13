import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

const BUCKET = 'payroll-statements'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'groomer'

// GET /api/admin/payroll-statements            → every sent statement (newest pay date first)
// GET /api/admin/payroll-statements?id=<uuid>  → short-lived signed link to that statement's PDF
export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    const { data: row } = await supabase.from('payroll_statements').select('pdf_path').eq('id', id).maybeSingle()
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.pdf_path, 600)
    if (error || !data) return NextResponse.json({ error: error?.message || 'Could not open file' }, { status: 500 })
    return NextResponse.json({ url: data.signedUrl })
  }
  const { data, error } = await supabase
    .from('payroll_statements')
    .select('id, groomer_name, period_start, period_end, pay_date, total_pay, summary, sent_by, sent_at')
    .order('pay_date', { ascending: false, nullsFirst: false })
    .order('sent_at', { ascending: false })
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ statements: data ?? [] })
}

// POST multipart/form-data: groomer_name, period_start, period_end, pay_date?, total_pay, summary (JSON), file (PDF)
// Re-sending the same groomer + period replaces the earlier statement.
export async function POST(req: NextRequest) {
  const supabase = getAdminClient()
  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }) }

  const groomerName = String(form.get('groomer_name') || '').trim()
  const periodStart = String(form.get('period_start') || '')
  const periodEnd = String(form.get('period_end') || '')
  const payDate = String(form.get('pay_date') || '') || null
  const totalPay = parseFloat(String(form.get('total_pay') || '0')) || 0
  const file = form.get('file')
  let summary: unknown = null
  try { summary = JSON.parse(String(form.get('summary') || 'null')) } catch { summary = null }

  if (!groomerName || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    return NextResponse.json({ error: 'groomer_name, period_start and period_end are required' }, { status: 400 })
  }
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: 'PDF file required' }, { status: 400 })

  const sentBy = decodeURIComponent(req.headers.get('x-actor-name') || '') || 'Admin'
  const path = `${periodEnd}/${slug(groomerName)}-${Date.now()}.pdf`
  const bytes = Buffer.from(await file.arrayBuffer())
  const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: false })
  if (up.error) return NextResponse.json({ error: `Upload failed: ${up.error.message}` }, { status: 500 })

  // Remember the older statement(s) for the same groomer + period so we can replace them
  const { data: old } = await supabase.from('payroll_statements').select('id, pdf_path')
    .eq('groomer_name', groomerName).eq('period_start', periodStart).eq('period_end', periodEnd)

  const { data: inserted, error } = await supabase.from('payroll_statements').insert({
    groomer_name: groomerName, period_start: periodStart, period_end: periodEnd,
    pay_date: payDate, total_pay: totalPay, summary, pdf_path: path, sent_by: sentBy,
  }).select('id').single()
  if (error || !inserted) {
    await supabase.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: error?.message || 'Could not save statement (did you run the payroll_statements SQL?)' }, { status: 500 })
  }

  if (old && old.length > 0) {
    await supabase.from('payroll_statements').delete().in('id', old.map(o => o.id))
    await supabase.storage.from(BUCKET).remove(old.map(o => o.pdf_path))
  }
  return NextResponse.json({ success: true, id: inserted.id })
}

// DELETE /api/admin/payroll-statements?id=<uuid> → un-send (groomer no longer sees it)
export async function DELETE(req: NextRequest) {
  const supabase = getAdminClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data: row } = await supabase.from('payroll_statements').select('pdf_path').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { error } = await supabase.from('payroll_statements').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await supabase.storage.from(BUCKET).remove([row.pdf_path])
  return NextResponse.json({ success: true })
}
