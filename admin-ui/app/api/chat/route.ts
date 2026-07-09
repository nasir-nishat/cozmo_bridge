import { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'

const OPENAI_URL = 'https://api.openai.com/v1'
const OPENAI_MODEL = 'gpt-4o'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? ''
const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://localhost:1234/v1/chat/completions'
const LM_STUDIO_MODEL = process.env.LM_STUDIO_MODEL || 'google/gemma-4-e4b'
const DATA_DIR = path.join(process.cwd(), '..', 'src', 'data')
const ROOT_DIR = path.join(process.cwd(), '..')
const AI_LEARNING_INBOX = path.join(ROOT_DIR, 'docs', 'ai-learning-inbox.md')
const TODO_FILE = path.join(ROOT_DIR, 'todo.md')
const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:3001'

function loadKB(): any {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'src', 'knowledge', 'knowledge-base.json'), 'utf-8'))
  } catch {
    return { entries: [], propertyCodes: [], categories: [], entryCount: 0 }
  }
}

const PRICING_RE = /\b(price|rate|cost|fee|charge|how much|quote|pricing|amount|total|nightly|per night|nights?|stay)\b/i

async function fetchWebSearchFacts(query: string): Promise<string> {
  try {
    const res = await fetch(`${BRIDGE_URL}/admin/web-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return ''
    const data = await res.json() as { ok: boolean; found?: boolean; text?: string; source?: string }
    if (!data.found || !data.text) return ''
    return `\n\n[Web Search Result]\n${data.text}` + (data.source ? `\nSource: ${data.source}` : '')
  } catch {
    return ''
  }
}

async function fetchLivePricingFacts(groupKey: string, message: string): Promise<string> {
  try {
    const res = await fetch(`${BRIDGE_URL}/admin/lead-pricing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupKey, message }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return ''
    const data = await res.json() as { ok: boolean; facts?: string[]; title?: string }
    if (!data.facts?.length) return ''
    return `\n\n[Live Hostfully Booking Data]\n${data.facts.map((f: string) => `• ${f}`).join('\n')}`
  } catch {
    return ''
  }
}

// CLAUDE.md loaded once at startup; Config section stripped to avoid injecting API keys into prompts
const DEV_CONTEXT = (() => {
  try {
    const raw = fs.readFileSync(path.join(ROOT_DIR, 'CLAUDE.md'), 'utf-8')
    let skip = false
    return raw.split('\n').filter(line => {
      if (line.startsWith('## Config')) { skip = true; return false }
      if (skip && line.startsWith('## ')) skip = false
      return !skip
    }).join('\n').trim()
  } catch {
    return ''
  }
})()

interface KBEntry {
  id: string
  propertyCode: string
  category: string
  title: string
  triggers: string[]
  facts: string[]
  links?: string[]
  sensitive?: boolean
}

interface BufferedMessage {
  sender: string
  text: string
  ts: number
}

interface KBMatch {
  entry: KBEntry
  score: number
  reasons: string[]
}

interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

const PROPERTY_OPTIONS = [
  { code: 'BS', name: 'Joyhasla Bukchon' },
  { code: 'SG', name: 'Joyhasla Seongsu' },
  { code: 'SJ', name: 'Joyhasla Sinchon' },
  { code: 'SA', name: 'Achae' },
  { code: 'SWA', name: 'Leeha' },
  { code: 'JT', name: 'Teva (Itaewon)' },
  { code: 'JTS', name: 'Teva Studio' },
  { code: 'HT', name: 'Teva Retreat' },
  { code: 'HTA', name: 'Teva Wellness' },
  { code: 'HTB', name: 'Teva Aeris Garden' },
  { code: 'L9', name: 'Yeonnam Lotus' },
  { code: 'F9', name: 'Yeonnam Fish' },
  { code: 'B9', name: 'Yeonnam Bird' },
  { code: 'GK', name: 'Kelly Luxury' },
  { code: 'GKA', name: 'Kelly Ananda' },
  { code: 'GKB', name: 'Kelly Prana' },
]

const PROPERTY_NAME_ALIASES: Record<string, string[]> = {
  BS: ['joyhasla bukchon', 'bukchon', 'bs_'],
  SG: ['joyhasla seongsu', 'seongsu', 'sg_'],
  SJ: ['joyhasla sinchon', 'sinchon', 'sj_'],
  SA: ['achae', 'sa_'],
  SWA: ['leeha', 'swa_'],
  JT: ['teva itaewon', 'teva (itaewon)', 'itaewon', 'jt_'],
  JTS: ['teva studio', 'jts_'],
  HT: ['teva retreat', 'ht_'],
  HTA: ['teva wellness', 'hta_'],
  HTB: ['teva aeris', 'aeris garden', 'htb_'],
  L9: ['yeonnam lotus', 'lotus', 'l9_'],
  F9: ['yeonnam fish', 'fish', 'f9_'],
  B9: ['yeonnam bird', 'bird', 'b9_'],
  GK: ['kelly luxury', 'gk_'],
  GKA: ['kelly ananda', 'ananda', 'gka_'],
  GKB: ['kelly prana', 'prana', 'gkb_'],
}

function extractPropertyFromHistory(history: ChatHistoryMessage[], currentMessage: string): string | undefined {
  const allText = [...history.map(m => m.content), currentMessage].join(' ').toLowerCase()

  for (const [code, aliases] of Object.entries(PROPERTY_NAME_ALIASES)) {
    if (aliases.some(a => allText.includes(a))) return code
  }

  // If the last assistant message asked "Which property", treat a numeric reply as a selection
  const lastAssistant = [...history].reverse().find(m => m.role === 'assistant')
  if (lastAssistant?.content.includes('Which property are you staying at')) {
    const numMatch = currentMessage.trim().match(/^([1-9][0-9]?)/)
    if (numMatch) {
      const idx = parseInt(numMatch[1], 10) - 1
      return PROPERTY_OPTIONS[idx]?.code
    }
  }

  return undefined
}

function buildGuestSimPrompt(kbContext: string, detectedPropertyCode?: string): string {
  const propertyList = PROPERTY_OPTIONS.map((p, i) => `${i + 1}. ${p.name}`).join('\n')
  const propertyLine = detectedPropertyCode
    ? `Guest's property: ${PROPERTY_OPTIONS.find(p => p.code === detectedPropertyCode)?.name || detectedPropertyCode} (${detectedPropertyCode})`
    : 'Guest property: unknown — may need to ask'

  return [
    'You are COZMO AI, the guest care assistant for COZE Hospitality in Seoul, South Korea.',
    'You are responding DIRECTLY to a guest inside their WhatsApp group chat.',
    'Answer helpfully and briefly using only the KB facts provided below.',
    '',
    propertyLine,
    '',
    'RULES:',
    '- Short and conversational — 2 to 4 sentences or a tight bullet list',
    '- Warm and natural — like a helpful local contact, not a formal assistant',
    '- Use only KB facts — never invent prices, policies, or procedures',
    '- If KB has no answer, say: "Let me check with the team and follow up! 🙏"',
    '- Never share door codes, wifi passwords, or private staff contacts',
    '- No filler intros ("Great question!", "Of course!", "Absolutely!")',
    '- Reply in the same language the guest used (English / Korean / Japanese / Chinese)',
    '',
    'PROPERTY CLARIFICATION RULE:',
    'If the guest asks about anything location-specific — nearby coffee shops, cafes, restaurants,',
    'bars, convenience stores, supermarkets, pharmacies, parks, walks, neighborhood attractions —',
    'AND you do not yet know which property they are at (from earlier in this conversation),',
    'ask them first using this exact format and wait for their answer:',
    '',
    'There are a lot, but which property you are staying at?',
    propertyList,
    '',
    'Once you know the property (from their reply or from this conversation), answer directly — do NOT ask again.',
    '',
    kbContext
      ? `KB FACTS (use these to answer — do not invent beyond them):\n${kbContext}`
      : 'No KB entries matched this question. Do not invent an answer — say you will check with the team.',
  ].join('\n')
}

const STOPWORDS = new Set([
  'what', 'are', 'the', 'how', 'does', 'did', 'is', 'it', 'in', 'at',
  'to', 'for', 'of', 'and', 'or', 'my', 'can', 'do', 'we', 'you', 'an',
  'be', 'was', 'will', 'have', 'has', 'this', 'that', 'any', 'some',
  'get', 'use', 'give', 'tell', 'me', 'about', 'with', 'from', 'need',
])

const SEMANTIC_ALIASES: Record<string, string[]> = {
  'airport pickup': ['airport van', 'airport transfer', 'airport transport', 'incheon', 'gimpo', '공항', '픽업', '空港', '机场', '機場'],
  bbq: ['barbecue', 'grill', 'weber', '바베큐', '바비큐', '焼肉', '烤肉', '烧烤'],
  breakfast: ['grocery', 'groceries', 'morning food', '아침', '조식', '朝食', '早餐'],
  checkout: ['check out', 'departure', 'leave', '퇴실', 'チェックアウト', '退房'],
  checkin: ['check in', 'arrival', '입실', '체크인', 'チェックイン', '入住'],
  parking: ['car', 'vehicle', 'park', '주차', '駐車', '停车', '停車'],
  trash: ['garbage', 'waste', 'recycling', '쓰레기', '분리수거', 'ゴミ', '垃圾'],
  food: ['delivery', 'coupang', 'restaurant', 'meal', '음식', '배달', '食事', '餐厅', '餐廳', '外卖'],
  taxi: ['ride', 'mpv', 'van taxi', 'naver pin', '택시', 'タクシー', '出租车', '的士'],
  wifi: ['wi-fi', 'internet', 'password', '와이파이', 'wifi password', '无线网', '無線網'],
  door: ['door code', 'gate code', 'pin', 'key box', '현관', '도어락', '門鎖', '门锁'],
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .split(/[\s"'`~!@#$%^&*()_+\-=[\]{};:,.<>/?\\|]+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w))
}

function expandQuery(query: string): string[] {
  const lower = query.toLowerCase().normalize('NFKC')
  const terms = new Set(tokenize(lower))

  for (const [canonical, aliases] of Object.entries(SEMANTIC_ALIASES)) {
    const candidates = [canonical, ...aliases]
    if (candidates.some(term => lower.includes(term.toLowerCase()))) {
      for (const term of candidates) {
        for (const token of tokenize(term)) terms.add(token)
      }
    }
  }

  return Array.from(terms)
}

function scoreEntry(entry: KBEntry, query: string, terms: string[], propertyCode?: string): KBMatch {
  const title = entry.title.toLowerCase()
  const category = entry.category.toLowerCase()
  const triggers = entry.triggers.map(t => t.toLowerCase())
  const facts = entry.facts.map(f => f.toLowerCase())
  const haystack = [title, category, ...triggers, ...facts].join('\n')
  const lowerQuery = query.toLowerCase()

  let score = 0
  const reasons = new Set<string>()

  if (propertyCode && entry.propertyCode === propertyCode) {
    score += 4
    reasons.add(`property:${propertyCode}`)
  } else if (entry.propertyCode === 'ALL') {
    score += 1
    reasons.add('cross-property')
  }

  if (title && lowerQuery.includes(title)) {
    score += 8
    reasons.add('title phrase')
  }

  for (const term of terms) {
    if (title.includes(term)) {
      score += 4
      reasons.add('title')
    }
    if (triggers.some(t => t.includes(term) || term.includes(t))) {
      score += 3
      reasons.add('trigger')
    }
    if (category.includes(term)) {
      score += 2
      reasons.add('category')
    }
    if (facts.some(f => f.includes(term))) {
      score += 1
      reasons.add('fact')
    }
    if (haystack.includes(term)) {
      score += 0.25
    }
  }

  return { entry, score, reasons: Array.from(reasons) }
}

function searchKB(query: string, propertyCode?: string): KBMatch[] {
  const entries = loadKB().entries as KBEntry[]
  const terms = expandQuery(query)
  if (!terms.length) return []

  return entries
    .filter(e => !e.sensitive)
    .filter(e => !propertyCode || e.propertyCode === 'ALL' || e.propertyCode === propertyCode)
    .map(e => scoreEntry(e, query, terms, propertyCode))
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.entry.title.localeCompare(b.entry.title)
    })
    .slice(0, 5)
}

function buildKBContext(matches: KBMatch[]): string {
  return matches.map(({ entry: e, score, reasons }) =>
    `### ${e.title}${e.propertyCode !== 'ALL' ? ` (${e.propertyCode})` : ''} [source: knowledge-base:${e.id}; category:${e.category}; score:${score.toFixed(2)}; match:${reasons.join(', ') || 'keyword'}]\n` +
    e.facts.map(f => `- ${f}`).join('\n') +
    (e.links?.length ? `\nMore info: ${e.links.join(', ')}` : '')
  ).join('\n\n')
}

// Full KB for guest-facing modes — same as aiReply.ts buildSystemKB.
// Prevents hallucination by giving the LLM all known facts up front instead of
// relying on per-message keyword matches that can silently miss entries.
function buildFullGuestKB(propertyCode?: string): string {
  const entries = loadKB().entries as KBEntry[]
  const relevant = entries.filter((e: KBEntry) => {
    if (e.sensitive) return false
    if (!e.facts.length) return false
    return e.propertyCode === 'ALL' || !propertyCode || e.propertyCode === propertyCode
  })
  if (!relevant.length) return ''
  const lines: string[] = []
  let factCount = 0
  for (const entry of relevant) {
    if (factCount >= 250) break
    lines.push(`[${entry.title}]`)
    for (const f of entry.facts) { lines.push(`• ${f}`); factCount++ }
    if (entry.links?.length) lines.push(`→ ${entry.links[0]}`)
  }
  return lines.join('\n')
}

function getRecentMessages(groupKey: string, sinceMinutes: number): BufferedMessage[] {
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, 'message-buffer.json'), 'utf-8')
    const buf: Record<string, BufferedMessage[]> = JSON.parse(raw)
    const cutoff = Date.now() - sinceMinutes * 60 * 1000
    const filtered = (buf[groupKey] ?? []).filter(m => m.ts >= cutoff)
    return filtered.slice(-20) // cap at 20 most recent to stay within context window
  } catch {
    return []
  }
}

function buildChatContext(messages: BufferedMessage[], groupKey: string): string {
  if (!messages.length) return `No recent messages found for group ${groupKey} in the last 4 hours.`
  return messages
    .map(m => {
      const time = new Date(m.ts).toISOString().slice(11, 16)
      return `[${time}] ${m.sender}: ${m.text}`
    })
    .join('\n')
}

function buildClarificationContext(
  role: string,
  message: string,
  matchCount: number,
  hasGroupContext: boolean,
  propertyCode?: string,
): string {
  const lower = message.toLowerCase()
  const shortQuestion = tokenize(message).length <= 3
  const asksAboutLiveGroup = /\b(this|that|guest|group|chat|conversation|happened|do next)\b/.test(lower)
  const asksAirportVan = /\b(airport|van|transfer|pickup|pick.?up|incheon|gimpo)\b/.test(lower)
  const missingProperty = !propertyCode && /\b(property|house|stay|check.?in|checkout|parking|bbq|trash|food|taxi|airport|van)\b/.test(lower)

  const reasons: string[] = []
  if (shortQuestion && matchCount === 0) reasons.push('question is too short and no source matched')
  if (role === 'team' && asksAboutLiveGroup && !hasGroupContext) reasons.push('team question appears to need a selected group')
  if (role === 'guest_draft' && matchCount === 0) reasons.push('guest draft has no matching guest-safe KB facts')
  if (missingProperty && !(role === 'guest_draft' && asksAirportVan && matchCount > 0)) {
    reasons.push('property may be needed for an accurate answer')
  }

  if (!reasons.length) return 'Clarification need: none detected.'

  return [
    `Clarification need: ${reasons.join('; ')}.`,
    'Before answering, ask 1-2 short follow-up questions. Do not guess.',
  ].join('\n')
}

function buildTeamPrompt(chatContext: string, groupKey: string | undefined, kbContext: string, clarificationContext: string): string {
  return [
    'You are COZMO, a hospitality operations assistant for the COZE Hospitality team in Seoul.',
    'Keep every response VERY SHORT. Maximum 5 bullets total. No intro sentence, no closing sentence.',
    'Never reveal door codes, Wi-Fi passwords, API keys, or private contact details.',
    'Never send anything externally. Answer and suggest only.',
    '',
    chatContext
      ? `RECENT GROUP CHAT [source: recent_chat:${groupKey}] (last 4 hours):\n${chatContext}`
      : '',
    kbContext
      ? `\nHYBRID RETRIEVAL RESULTS (keyword + semantic aliases + metadata ranking):\n${kbContext}`
      : '\nNo KB entries found for this topic.',
    '',
    `CLARIFICATION CHECK:\n${clarificationContext}`,
    '',
    'RULES: No credentials. No external sends. Draft any message as "Draft only — needs confirmation".',
    'If the clarification check says clarification is needed, ask the follow-up question first and stop.',
    '',
    'CLARIFY FORMAT: Start with "Quick check:" and ask at most 2 questions.',
    '',
    'FORMAT RULES (mandatory):',
    '- Always use bullet points or numbered lists. Never write long paragraphs.',
    '- One fact or action per line. Blank line between sections.',
    '- Use emojis liberally — one per bullet to make it easy to scan.',
    '- Bold all KRW amounts, prices, times, and place names using **bold**. Example: **₩90,000**, **3:00 PM**, **Incheon Airport**.',
    '- If the KB has a link for this topic, include it: 🔗 [label](url)',
    '- Section labels: 📋 Summary · ⚠️ Issue · ✅ Next steps · 💬 Guest said.',
    '- If action needed → 🗂️ Suggested task: property / type / priority / summary / assigneeHint / source / needsHumanConfirmation: true',
    '- Last line: 📎 Sources: ...',
  ].filter(Boolean).join('\n')
}

function buildDeveloperPrompt(kbContext: string, clarificationContext: string): string {
  return [
    'You are COZMO, a technical assistant for COZE Hospitality developers.',
    'Keep every response VERY SHORT. Maximum 5 bullets total. No intro sentence, no closing sentence.',
    'Never reveal API keys, tokens, passwords, or secrets — even in developer mode.',
    '',
    DEV_CONTEXT ? `COZMO SYSTEM DOCUMENTATION (CLAUDE.md):\n${DEV_CONTEXT}` : '',
    kbContext ? `\nHYBRID RETRIEVAL RESULTS:\n${kbContext}` : '',
    '',
    `CLARIFICATION CHECK:\n${clarificationContext}`,
    '',
    'If the request is ambiguous about platform, file, or workflow, ask 1-2 short follow-up questions first.',
    'CLARIFY FORMAT: Start with "Quick check:" and ask at most 2 questions.',
    '',
    'FORMAT RULES (mandatory):',
    '- Always use bullet points or numbered lists. Never write long paragraphs.',
    '- One fact or step per line. Blank line between sections.',
    '- Use emojis liberally — one per bullet to make it easy to scan.',
    '- Bold all ports, file paths, function names, times, and key values using **bold**. Example: **:1234**, **3:00 PM**, **message-buffer.json**.',
    '- Section labels: 🗂️ Overview · 🔄 Flow · 📁 Files · ⚙️ How it works · ⚠️ Gotcha.',
    '- Numbered list for steps. Table for comparing components or routes.',
    '- For architecture, routing, webhook, data flow, or debugging questions, include a compact ASCII diagram in a fenced `text` code block.',
    '- Diagram style: boxes/nodes with arrows, max 8 lines, then 1-3 bullets explaining the key handoff points.',
    '- Use → arrows for data flow. Use `inline code` for file paths and function names.',
    '- Last line: 📎 Sources: ...',
  ].filter(Boolean).join('\n')
}

function buildGuestDraftPrompt(kbContext: string, clarificationContext: string): string {
  return [
    'You are COZMO, helping staff draft a guest reply. DRAFT ONLY — never auto-send.',
    'Write like a calm human guest-care team member in a WhatsApp chat, not like an AI assistant.',
    'Make the reply feel curated to the guest request: reuse the guest\'s specific need, location, timing, family/group detail, or preference when it is present.',
    'Use only KB facts below. Do not invent prices, policies, or procedures.',
    'Never reveal door codes, Wi-Fi passwords, or private contacts.',
    'Never write check-in, checkout, welcome, or farewell messages — those come from Google Sheets.',
    'Do not upsell unrelated services. Do not force Coupang, taxis, tours, or Naver Map into the answer unless directly useful.',
    'Do not say generic phrases like "We understand that..." or "While we do not have specific information..." unless it is truly necessary.',
    'If the KB does not contain the answer, say staff will check and follow up. Do not pad with nearby-but-unrelated facts.',
    '',
    kbContext
      ? `HYBRID RETRIEVAL RESULTS:\n${kbContext}`
      : 'No KB entries found. Do not invent an answer.',
    '',
    `CLARIFICATION CHECK:\n${clarificationContext}`,
    '',
    'If KB facts directly answer part of the guest request, answer the known part first, then ask only the missing follow-up detail.',
    'Only ask the follow-up question first when there are no directly useful KB facts.',
    'CLARIFY FORMAT: Start with "Quick check:" and ask at most 2 questions.',
    '',
    'FORMAT RULES (mandatory):',
    '- Line 1 exactly: "DRAFT ONLY — Needs staff review before sending."',
    '- Line 2: blank line.',
    '- Line 3+: the draft reply. Maximum 80 words.',
    '- Do not add separators such as "***", "---", or decorative divider lines.',
    '- Prefer 2-4 short natural sentences. Use bullets only if the guest asks for a list.',
    '- Directly answer the guest first, then add only the most useful next step.',
    '- Personalize with one concrete detail from the guest question when available.',
    '- If the guest asks for recommendations and KB has no exact venue/place, say the team can check current local options instead of giving generic app advice.',
    '- If the KB has a directly relevant link, include one short sentence with the link.',
    '- Use at most 1 emoji total. No decorative emojis.',
    '- Bold all KRW amounts, prices, times, and place names using **bold**. Example: **₩90,000**, **11:00 AM**, **Incheon Airport**.',
    '- Warm, plain English. Sound like a real staff member.',
    '- Credentials question → say: "Please use the approved check-in information workflow."',
    '- Lifecycle message request → say: "Use the /welcome, /ckin, or /ckout command instead."',
  ].filter(Boolean).join('\n')
}

function needsHumanEscalation(draft: string): boolean {
  const lower = draft.toLowerCase()
  return [
    'check with the team',
    'check with our team',
    'connect you with',
    'connect with a staff',
    'connect with the team',
    'staff member',
    'team member',
    'follow up',
    'get back to you',
    'let me check',
    'will check',
    'reach out to',
    'connect with a human',
  ].some(phrase => lower.includes(phrase))
}

function streamText(content: string): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}

async function generateLocalChat(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(LM_STUDIO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LM_STUDIO_MODEL,
      messages,
      stream: false,
      temperature: 0.35,
      max_tokens: 1500,
    }),
    signal: AbortSignal.timeout(60000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Local LLM returned ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`)
  }

  const json = await res.json() as any
  const content = json?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') throw new Error('Local LLM returned an empty response')
  return content.trim()
}

async function streamLocalFallback(messages: ChatMessage[], role: string, message: string, propertyCode?: string): Promise<Response> {
  const reply = await generateLocalChat(messages)
  if (role === 'guest_draft' && needsHumanEscalation(reply)) {
    fetch(`${BRIDGE_URL}/admin/chat-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestMessage: message, draft: reply, propertyCode }),
    }).catch(() => {})
  }
  return streamText(reply)
}

function getLearningCommand(message: string): string | null {
  const trimmed = message.trim()
  const match = trimmed.match(/^\/(?:learn|kb-log|rag-log)\s+([\s\S]+)/i)
  return match?.[1]?.trim() || null
}

function cleanLogText(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)
}

function appendLearningTodo(correction: string) {
  try {
    const todo = fs.readFileSync(TODO_FILE, 'utf-8')
    const item = `- [ ] **[AI learning] Review correction:** ${correction}\n  - Source: \`docs/ai-learning-inbox.md\`\n\n`
    if (todo.includes(item)) return
    const marker = '## Now\n\n'
    const next = todo.includes(marker) ? todo.replace(marker, `${marker}${item}`) : `${todo.trim()}\n\n${item}`
    fs.writeFileSync(TODO_FILE, next)
  } catch {}
}

function saveLearningCorrection(params: {
  correction: string
  role: string
  groupKey?: string
  propertyCode?: string
  history: ChatHistoryMessage[]
}) {
  const correction = cleanLogText(params.correction)
  if (!correction) return

  const previousAssistant = [...params.history].reverse().find(m => m.role === 'assistant')?.content
  const previousAnswer = previousAssistant ? cleanLogText(previousAssistant).slice(0, 500) : 'none captured'
  const createdAt = new Date().toISOString()

  if (!fs.existsSync(AI_LEARNING_INBOX)) {
    fs.writeFileSync(
      AI_LEARNING_INBOX,
      '# AI Learning Inbox\n\nTeam corrections captured from the admin chat. Review these before promoting anything into `knowledge-base.json`.\n\n',
    )
  }

  fs.appendFileSync(
    AI_LEARNING_INBOX,
    [
      `## ${createdAt}`,
      '',
      `- Role: ${params.role}`,
      `- Group: ${params.groupKey || 'not selected'}`,
      `- Property: ${params.propertyCode || 'not selected'}`,
      `- Correction: ${correction}`,
      `- Previous assistant answer: ${previousAnswer}`,
      '- Status: pending KB review',
      '',
    ].join('\n'),
  )

  appendLearningTodo(correction)
}


export async function POST(req: NextRequest) {
  const {
    message,
    history = [],
    role = 'team',
    groupKey,
    propertyCode,
    leadUid: _leadUid,
    platform: _platform,
  } = await req.json()

  const learningCorrection = getLearningCommand(message)
  if (learningCorrection) {
    saveLearningCorrection({
      correction: learningCorrection,
      role,
      groupKey,
      propertyCode,
      history,
    })

    return streamText(
      [
        '- Logged for RAG review.',
        '- Added a todo item to review this correction.',
        '- Nothing was sent externally.',
        '',
        'Use this format next time: `/learn No, we do not have halal options in Coupang Eats.`',
      ].join('\n'),
    )
  }

  // For guest_sim and guest_draft, extract property from conversation history for targeted KB search.
  // guest_draft users often paste the raw WA conversation (e.g. "SG_GuestName: ...") so property
  // can be inferred from sender name prefixes or property name mentions.
  const effectivePropertyCode = (role === 'guest_sim' || role === 'guest_draft')
    ? (extractPropertyFromHistory(history as ChatHistoryMessage[], message) ?? propertyCode)
    : propertyCode

  const relevant = searchKB(message, effectivePropertyCode).slice(0, role === 'team' ? 4 : 5)
  const kbContext = buildKBContext(relevant)

  // When staff has a group selected and the question is about pricing, fetch live Hostfully data
  const livePricingFacts = (role === 'team' && groupKey && PRICING_RE.test(message))
    ? await fetchLivePricingFacts(groupKey, message)
    : ''

  // For guest-facing modes with no KB match, search the web so the draft has real facts
  const webFacts = (role === 'guest_draft' || role === 'guest_sim') && relevant.length === 0
    ? await fetchWebSearchFacts(message)
    : ''

  let chatContext = ''
  if (role === 'team' && groupKey) {
    const msgs = getRecentMessages(groupKey, 240)
    chatContext = buildChatContext(msgs, groupKey)
  }

  const clarificationContext = buildClarificationContext(
    role,
    message,
    relevant.length,
    Boolean(role === 'team' && groupKey && chatContext),
    effectivePropertyCode,
  )

  let systemPrompt: string
  if (role === 'developer') {
    systemPrompt = buildDeveloperPrompt(kbContext, clarificationContext)
  } else if (role === 'guest_draft') {
    systemPrompt = buildGuestDraftPrompt(kbContext + webFacts, clarificationContext)
  } else if (role === 'guest_sim') {
    systemPrompt = buildGuestSimPrompt(kbContext + webFacts, effectivePropertyCode)
  } else {
    systemPrompt = buildTeamPrompt(chatContext, groupKey, kbContext + livePricingFacts, clarificationContext)
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-4),
    { role: 'user', content: message },
  ]

  try {
    if (!OPENAI_API_KEY) {
      return await streamLocalFallback(messages, role, message, propertyCode)
    }

    const res = await fetch(`${OPENAI_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: OPENAI_MODEL, messages, stream: true, temperature: 0.4, max_tokens: 1500 }),
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok || !res.body) {
      console.warn(`Admin chat OpenAI failed with ${res.status}; trying local LLM`)
      return await streamLocalFallback(messages, role, message, propertyCode)
    }

    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()
    const reader = res.body.getReader()

    ;(async () => {
      let buf = ''
      let fullDraft = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') {
              await writer.write(encoder.encode('data: [DONE]\n\n'))
              if (role === 'guest_draft' && needsHumanEscalation(fullDraft)) {
                fetch(`${BRIDGE_URL}/admin/chat-alert`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ guestMessage: message, draft: fullDraft, propertyCode }),
                }).catch(() => {})
              }
              return
            }
            try {
              const json = JSON.parse(data)
              const content = json.choices?.[0]?.delta?.content
              if (content) {
                fullDraft += content
                await writer.write(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
              }
            } catch {}
          }
        }
      } finally {
        await writer.close().catch(() => {})
      }
    })()

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err: any) {
    try {
      return await streamLocalFallback(messages, role, message, propertyCode)
    } catch (fallbackErr: any) {
      return new Response(
        JSON.stringify({ error: fallbackErr?.message || err?.message || 'AI request failed' }),
        { status: 502 },
      )
    }
  }
}
