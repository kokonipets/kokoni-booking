import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

export const dynamic = 'force-dynamic'

// GET /api/admin/chat/media?sid=MMxxxx&i=0
// Streams a photo (MMS media) from Twilio, authenticated with the salon's
// Twilio credentials so the browser can display it via a plain <img> tag.
export async function GET(req: NextRequest) {
  const sid = req.nextUrl.searchParams.get('sid') ?? ''
  const i = parseInt(req.nextUrl.searchParams.get('i') ?? '0', 10) || 0

  // Only allow well-formed Twilio message SIDs (prevents this from being used
  // as an open proxy to arbitrary URLs).
  if (!/^(MM|SM)[0-9a-fA-F]{32}$/.test(sid)) {
    return NextResponse.json({ error: 'Invalid message id' }, { status: 400 })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) {
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 })
  }

  try {
    const client = twilio(accountSid, authToken)
    const mediaList = await client.messages(sid).media.list({ limit: 10 })
    const media = mediaList[i]
    if (!media) return NextResponse.json({ error: 'No media' }, { status: 404 })

    const mediaUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${sid}/Media/${media.sid}`
    const resp = await fetch(mediaUrl, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64') },
      redirect: 'follow',
    })
    if (!resp.ok) return NextResponse.json({ error: 'Media fetch failed' }, { status: 502 })

    const buf = Buffer.from(await resp.arrayBuffer())
    return new NextResponse(buf, {
      headers: {
        'Content-Type': media.contentType || 'image/jpeg',
        'Cache-Control': 'private, max-age=86400',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
