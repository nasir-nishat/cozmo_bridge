import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), '..', 'src', 'data')

function readJson<T>(filename: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf-8'))
  } catch {
    return fallback
  }
}

// WA group keys have no prefix — they're raw JIDs like 120363409035497507@g.us
function detectPlatform(groupKey: string): { platform: string; prefix: string; rawId: string } {
  if (groupKey.includes(':')) {
    const colonIdx = groupKey.indexOf(':')
    const prefix = groupKey.slice(0, colonIdx)
    const rawId = groupKey.slice(colonIdx + 1)
    const labels: Record<string, string> = { kakao: 'KakaoTalk', line: 'LINE', wechat: 'WeChat', wa: 'WhatsApp' }
    return { platform: labels[prefix] ?? prefix, prefix, rawId }
  }
  // WA: raw JID (contains @g.us or @s.whatsapp.net)
  return { platform: 'WhatsApp', prefix: 'wa', rawId: groupKey }
}

// Extract property code from group name — format: "COZE {CODE} {date} ..."
function extractPropertyCode(name: string): string | undefined {
  const m = name.match(/^COZE\s+([A-Z0-9]+)\s+/i)
  return m ? m[1].toUpperCase() : undefined
}

export async function GET() {
  const buffer: Record<string, { sender: string; text: string; ts: number }[]> =
    readJson('message-buffer.json', {})
  const waNames: Record<string, string> = readJson('group-names.json', {})
  const kakaoNames: Record<string, string> = readJson('kakao-chat-names.json', {})

  const cutoff = Date.now() - 24 * 60 * 60 * 1000

  type GroupEntry = {
    groupKey: string
    name: string
    platform: string
    propertyCode?: string
    messageCount: number
    lastActive: number
    messages: { sender: string; text: string; ts: number }[]
  }

  const groups = Object.entries(buffer)
    .map(([groupKey, messages]): GroupEntry | null => {
      const recent = messages.filter(m => m.ts >= cutoff)
      if (!recent.length) return null

      const { platform, prefix, rawId } = detectPlatform(groupKey)

      let name: string
      if (prefix === 'wa') name = waNames[rawId] ?? groupKey
      else if (prefix === 'kakao') name = kakaoNames[rawId] ?? groupKey
      else name = groupKey

      return {
        groupKey,
        name,
        platform,
        propertyCode: extractPropertyCode(name),
        messageCount: recent.length,
        lastActive: Math.max(...recent.map(m => m.ts)),
        messages: recent.slice(-50),
      }
    })
    .filter((g): g is GroupEntry => g !== null)
    .sort((a, b) => b.lastActive - a.lastActive)

  return NextResponse.json({ groups })
}
