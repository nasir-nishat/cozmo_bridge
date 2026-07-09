import { NextResponse } from 'next/server'
import crypto from 'crypto'

const SECRET = 'cozmo-admin-secret-2026-xK9p'
const EMAIL = 'cozmo@coze.care'
const PASSWORD = 'Coze2026'
const TTL = 30 * 24 * 60 * 60 * 1000 // 30 days

function sign(payload: object): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url')
  return `${data}.${sig}`
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as Record<string, string>
  if (body.email !== EMAIL || body.password !== PASSWORD) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }
  const token = sign({ email: body.email, exp: Date.now() + TTL })
  return NextResponse.json({ token })
}
