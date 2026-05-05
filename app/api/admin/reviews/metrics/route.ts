import { createSupabaseServer } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const supabase = createSupabaseServer()
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'today' // today, week, month

    // Calculate date range
    const now = new Date()
    let startDate = new Date(now)

    if (period === 'today') {
      startDate.setHours(0, 0, 0, 0)
    } else if (period === 'week') {
      startDate.setDate(now.getDate() - 7)
      startDate.setHours(0, 0, 0, 0)
    } else if (period === 'month') {
      startDate.setDate(1)
      startDate.setHours(0, 0, 0, 0)
    }

    // Fetch metrics
    const { data: reviews, error } = await supabase
      .from('reviews')
      .select('id, rating, status, created_at')
      .gte('created_at', startDate.toISOString())

    if (error) throw error

    // Calculate metrics
    const sent = reviews.filter(r => r.created_at).length
    const responses = reviews.filter(r => r.rating !== null).length
    const positive = reviews.filter(r => r.rating && r.rating >= 4).length
    const negative = reviews.filter(r => r.rating && r.rating <= 3).length
    const responseRate = sent > 0 ? Math.round((responses / sent) * 100) : 0

    return Response.json({
      period,
      sent,
      responses,
      positive,
      negative,
      responseRate,
      averageRating: responses > 0
        ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / responses).toFixed(2)
        : null
    })
  } catch (error) {
    console.error('Error fetching review metrics:', error)
    return Response.json({ error: 'Failed to fetch metrics' }, { status: 500 })
  }
}
