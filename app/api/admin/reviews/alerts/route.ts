import { createSupabaseServer } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const supabase = createSupabaseServer()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'pending'
    const limit = parseInt(searchParams.get('limit') || '20')

    const { data: alerts, error } = await supabase
      .from('review_alerts')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    return Response.json(alerts)
  } catch (error) {
    console.error('Error fetching review alerts:', error)
    return Response.json({ error: 'Failed to fetch alerts' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseServer()
    const body = await request.json()
    const { alertId, action, notes } = body

    if (action === 'acknowledge') {
      const { error } = await supabase
        .from('review_alerts')
        .update({
          status: 'acknowledged',
          acknowledged_at: new Date().toISOString(),
          admin_notes: notes || null
        })
        .eq('id', alertId)

      if (error) throw error

      // Log activity
      await supabase
        .from('review_activity_log')
        .insert({
          action: 'alert_acknowledged',
          actor: 'admin',
          details: { alertId, notes }
        })

      return Response.json({ success: true })
    }

    if (action === 'resolve') {
      const { error } = await supabase
        .from('review_alerts')
        .update({
          status: 'resolved',
          updated_at: new Date().toISOString(),
          admin_notes: notes || null
        })
        .eq('id', alertId)

      if (error) throw error

      await supabase
        .from('review_activity_log')
        .insert({
          action: 'alert_resolved',
          actor: 'admin',
          details: { alertId, notes }
        })

      return Response.json({ success: true })
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error updating review alert:', error)
    return Response.json({ error: 'Failed to update alert' }, { status: 500 })
  }
}
