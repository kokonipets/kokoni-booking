import { createSupabaseServer } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const supabase = createSupabaseServer()
    const { searchParams } = new URL(request.url)

    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const sortBy = searchParams.get('sortBy') || 'created_at'

    let query = supabase.from('reviews').select('*')

    if (status) {
      query = query.eq('status', status)
    }

    const { data: reviews, error, count } = await query
      .order(sortBy, { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    return Response.json({
      reviews,
      total: count,
      limit,
      offset
    })
  } catch (error) {
    console.error('Error fetching reviews:', error)
    return Response.json({ error: 'Failed to fetch reviews' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = createSupabaseServer()
    const body = await request.json()
    const { id, admin_notes, follow_up_flagged } = body

    if (!id) return Response.json({ error: 'Review id required' }, { status: 400 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {}
    if (admin_notes !== undefined) updates.admin_notes = admin_notes
    if (follow_up_flagged !== undefined) updates.follow_up_flagged = follow_up_flagged

    const { error } = await supabase.from('reviews').update(updates).eq('id', id)
    if (error) throw error

    return Response.json({ success: true })
  } catch (error) {
    console.error('Error updating review:', error)
    return Response.json({ error: 'Failed to update review' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseServer()
    const body = await request.json()
    const { appointmentId, clientPhone, clientName } = body

    // Check if review already exists for this appointment
    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('appointment_id', appointmentId)
      .single()

    if (existing) {
      return Response.json({ error: 'Review already exists for this appointment' }, { status: 400 })
    }

    // Create review record
    const { data: review, error } = await supabase
      .from('reviews')
      .insert({
        appointment_id: appointmentId,
        client_phone: clientPhone,
        client_name: clientName,
        status: 'pending',
        review_request_sent_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error

    // Log activity
    await supabase
      .from('review_activity_log')
      .insert({
        review_id: review.id,
        action: 'review_created',
        actor: 'admin',
        details: { appointmentId, clientPhone }
      })

    return Response.json(review, { status: 201 })
  } catch (error) {
    console.error('Error creating review:', error)
    return Response.json({ error: 'Failed to create review' }, { status: 500 })
  }
}
