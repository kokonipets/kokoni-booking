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

// Same loose name match the other groomer APIs use: "Wylie" ↔ "Wylie Shen" (first names equal).
const first = (s: string) => (s || '').trim().split(/\s+/)[0]?.toLowerCase() || ''
const same = (a: string, b: string) => !!first(a) && first(a) === first(b)

// GET /api/groomer/payroll-statements?staff_name=X            → this groomer's sent statements
// GET /api/groomer/payroll-statements?staff_name=X&id=<uuid>  → signed link to one of THEIR PDFs
export async function GET(req: NextRequest) {
  const supabase = getAdminClient()
  const staffName = req.nextUrl.searchParams.get('staff_name') || ''
  const id = req.nextUrl.searchParams.get('id')
  if (!staffName.trim()) return NextResponse.json({ error: 'staff_name required' }, { status: 400 })

  const { data, error } = await supabase
    .from('payroll_statements')
    .select('id, groomer_name, period_start, period_end, pay_date, total_pay, summary, sent_at, pdf_path')
    .order('pay_date', { ascending: false, nullsFirst: false })
    .order('sent_at', { ascending: false })
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const mine = (data ?? []).filter(r => same(r.groomer_name, staffName))

  if (id) {
    const row = mine.find(r => r.id === id)
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const signed = await supabase.storage.from(BUCKET).createSignedUrl(row.pdf_path, 600)
    if (signed.error || !signed.data) return NextResponse.json({ error: signed.error?.message || 'Could not open file' }, { status: 500 })
    return NextResponse.json({ url: signed.data.signedUrl })
  }
  return NextResponse.json({
    statements: mine.map(({ pdf_path: _p, ...rest }) => { void _p; return rest }),
  })
}
