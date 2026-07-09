import { NextResponse } from 'next/server'
import crypto from 'crypto'

const SECRET = 'cozmo-admin-secret-2026-xK9p'

const INVALID = NextResponse.json({ valid: false }, { status: 401 })

export async function POST(req: Request) {
  try {
    const body = await req.json() as { token?: string }
    const token = body.token
    if (!token || typeof token !== 'string') return INVALID

    const dot = token.lastIndexOf('.')
    if (dot === -1) return INVALID

    const data = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url')

    // timingSafeEqual requires equal-length buffers — length check first
    const expectedBuf = Buffer.from(expected)
    const sigBuf = Buffer.from(sig)
    if (expectedBuf.length !== sigBuf.length) return INVALID
    if (!crypto.timingSafeEqual(expectedBuf, sigBuf)) return INVALID

    const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as { exp?: number }
    if (!payload.exp || payload.exp < Date.now()) return INVALID

    return NextResponse.json({ valid: true })
  } catch {
    return INVALID
  }
}
