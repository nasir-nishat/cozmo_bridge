'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, Copy, Check, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import kbData from '../../../src/knowledge/knowledge-base.json'

type Role = 'team' | 'developer' | 'guest_draft' | 'guest_sim'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Group {
  groupKey: string
  name: string
  platform: string
  propertyCode?: string
  messageCount: number
  lastActive: number
}

const ROLE_LABELS: Record<Role, string> = {
  guest_draft: 'Guest Chat',
  team: 'Team',
  developer: 'Developer',
  guest_sim: 'Guest Sim',
}

const VISIBLE_ROLES: Role[] = ['guest_draft', 'team', 'developer']

const ROLE_SUBTITLES: Record<Role, string> = {
  team: 'Ask anything — properties, services, guests',
  developer: 'Architecture, routes, services, runbooks',
  guest_draft: 'Draft a guest-safe reply for staff review',
  guest_sim: 'Simulate a guest — test how COZMO would respond',
}

const ROLE_PLACEHOLDERS: Record<Role, string> = {
  team: 'Message COZMO…',
  developer: 'Ask about routes, services, architecture…',
  guest_draft: 'Describe what the guest is asking…',
  guest_sim: 'Type as a guest…',
}

const mdComponents = {
  p: ({ children }: any) => <p className="mb-2.5 last:mb-0">{children}</p>,
  strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: any) => <em className="italic">{children}</em>,
  ul: ({ children }: any) => <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>,
  li: ({ children }: any) => <li className="leading-snug">{children}</li>,
  h1: ({ children }: any) => <p className="font-semibold mb-1">{children}</p>,
  h2: ({ children }: any) => <p className="font-semibold mb-1">{children}</p>,
  h3: ({ children }: any) => <p className="font-semibold mb-0.5">{children}</p>,
  table: ({ children }: any) => <table className="w-full text-[13px] border-collapse my-2">{children}</table>,
  thead: ({ children }: any) => <thead>{children}</thead>,
  tbody: ({ children }: any) => <tbody>{children}</tbody>,
  tr: ({ children }: any) => <tr>{children}</tr>,
  th: ({ children }: any) => <th className="text-left font-semibold pb-1 pr-4 border-b border-[#e5e5ea]">{children}</th>,
  td: ({ children }: any) => <td className="py-1 pr-4 border-b border-[#f2f2f7] align-top">{children}</td>,
  code: ({ children }: any) => <code className="bg-[#f2f2f7] rounded px-1 py-0.5 text-[12px] font-mono">{children}</code>,
  a: ({ href, children }: any) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#007aff] underline underline-offset-2 hover:opacity-70 transition-opacity">{children}</a>,
}

const ROLE_SUGGESTIONS: Record<Role, string[]> = {
  team: [
    'Summarize recent messages and suggest what staff should do',
    'How much is the airport van from Incheon?',
    'What are the check-in tips for guests?',
    'How does food delivery work at this property?',
  ],
  developer: [
    'Where does WeChat message detection happen?',
    'How does the KakaoTalk MessengerBot R setup work?',
    'What is the booking → WA group creation flow?',
    'How does request detection work across platforms?',
  ],
  guest_draft: [
    'Guest is asking about airport van options',
    'Guest wants to know about food delivery',
    'Guest is asking about early check-in',
    'Guest wants to know what to do nearby',
  ],
  guest_sim: [
    'What is the best coffee shop near here?',
    'Can we order food delivery tonight?',
    'How do we use the BBQ?',
    'What time is checkout tomorrow?',
  ],
}

function normalizeMessages(value: unknown): Message[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((msg): msg is Message => (
      msg !== null &&
      typeof msg === 'object' &&
      ((msg as Message).role === 'user' || (msg as Message).role === 'assistant') &&
      typeof (msg as Message).content === 'string'
    ))
    .slice(-40)
}

function readStoredMessages(role: Role): Message[] {
  try {
    const saved = localStorage.getItem(`cozmo_chat_${role}`)
    if (!saved) return []
    return normalizeMessages(JSON.parse(saved))
  } catch {
    localStorage.removeItem(`cozmo_chat_${role}`)
    return []
  }
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [role, setRole] = useState<Role>('guest_draft')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [groups, setGroups] = useState<Group[]>([])
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    fetch('/api/groups')
      .then(r => r.json())
      .then(({ groups }) => setGroups(groups ?? []))
      .catch(() => {})
  }, [])

  // Restore history for the initial role on mount
  useEffect(() => {
    setMessages(readStoredMessages(role))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist messages whenever they change
  useEffect(() => {
    if (messages.length === 0) return
    try {
      localStorage.setItem(`cozmo_chat_${role}`, JSON.stringify(messages.slice(-40)))
    } catch {}
  }, [messages]) // eslint-disable-line react-hooks/exhaustive-deps

  function switchRole(next: Role) {
    // Save current history before switching
    try {
      if (messages.length > 0) {
        localStorage.setItem(`cozmo_chat_${role}`, JSON.stringify(messages.slice(-40)))
      }
    } catch {}
    // Load next role's history
    const nextMessages = readStoredMessages(next)
    setRole(next)
    setMessages(nextMessages)
    if (next !== 'team') setSelectedGroup('')
  }

  function clearChat() {
    setMessages([])
    try { localStorage.removeItem(`cozmo_chat_${role}`) } catch {}
  }

  async function send(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || streaming) return
    setInput('')

    const userMsg: Message = { role: 'user', content: msg }
    const prevHistory = messages
    setMessages(m => [...m, userMsg, { role: 'assistant', content: '' }])
    setStreaming(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          // guest_sim needs more history so property selections from earlier turns are visible
          history: prevHistory.slice(role === 'guest_sim' ? -10 : -4).map(m => ({ role: m.role, content: m.content })),
          role,
          ...(role === 'team' && selectedGroup ? {
            groupKey: selectedGroup,
            propertyCode: selectedGroupData?.propertyCode,
          } : {}),
        }),
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(async () => ({
          error: (await res.text().catch(() => '')).trim() || `Chat API returned ${res.status}`,
        }))
        setMessages(m => [...m.slice(0, -1), { role: 'assistant', content: `⚠️ ${err.error}` }])
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const json = JSON.parse(data)
            if (json.content) {
              accumulated += json.content
              setMessages(m => [...m.slice(0, -1), { role: 'assistant', content: accumulated }])
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setMessages(m => [...m.slice(0, -1), { role: 'assistant', content: `⚠️ ${err.message}` }])
    } finally {
      setStreaming(false)
      inputRef.current?.focus()
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const selectedGroupData = groups.find(g => g.groupKey === selectedGroup)

  return (
    <div className="flex flex-col h-[calc(100vh-96px)] md:h-[calc(100vh-56px)]">

      {/* Header */}
      <div className="shrink-0 mb-3 flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-[#1d1d1f] tracking-tight leading-none">COZMO Chat</h1>
          <p className="text-[12px] text-[#8e8e93] mt-1">
            {role === 'team' && selectedGroupData
              ? `${selectedGroupData.name} · ${selectedGroupData.platform} · ${selectedGroupData.messageCount} recent msgs`
              : ROLE_SUBTITLES[role]}
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[12px] text-[#8e8e93] hover:text-[#ff3b30] hover:bg-[#fff2f1] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      <div className="shrink-0 mb-2 flex gap-1.5">
        {VISIBLE_ROLES.map(r => (
          <button
            key={r}
            onClick={() => switchRole(r)}
            className={cn(
              'flex-1 py-1.5 rounded-xl text-[12px] font-medium transition-colors',
              role === r
                ? 'bg-[#007aff] text-white'
                : 'bg-[#f2f2f7] text-[#8e8e93] hover:bg-[#e5e5ea] active:bg-[#d1d1d6]',
            )}
          >
            {ROLE_LABELS[r]}
          </button>
        ))}
      </div>

      {/* Group selector — team only */}
      {role === 'team' && groups.length > 0 && (
        <div className="shrink-0 mb-3">
          <select
            value={selectedGroup}
            onChange={e => {
              setSelectedGroup(e.target.value)
              setMessages([])
            }}
            className="w-full px-3 py-2 bg-white border border-[#e5e5ea] rounded-xl text-[13px] text-[#1d1d1f] outline-none"
          >
            <option value="">No group — general questions</option>
            {groups.map(g => (
              <option key={g.groupKey} value={g.groupKey}>
                {g.name} ({g.platform} · {g.messageCount} msgs)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col justify-end h-full pb-2 gap-4">
            <div className="text-center">
              <div className="w-11 h-11 rounded-2xl bg-[#f2f2f7] flex items-center justify-center text-xl mx-auto mb-2">
                {role === 'developer' ? '🛠' : role === 'guest_draft' ? '✏️' : role === 'guest_sim' ? '👤' : '💬'}
              </div>
              <p className="text-[15px] font-medium text-[#1d1d1f]">Ask COZMO anything</p>
              <p className="text-[13px] text-[#8e8e93] mt-0.5">
                {role === 'team' && selectedGroupData
                  ? `Asking about ${selectedGroupData.name}`
                  : ROLE_SUBTITLES[role]}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {ROLE_SUGGESTIONS[role].map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left px-4 py-3 bg-white border border-[#e5e5ea] rounded-xl text-[13px] text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 py-1">
            {messages.map((msg, i) => {
              const isDraft = msg.role === 'assistant' && msg.content.startsWith('DRAFT ONLY')
              return (
                <div
                  key={i}
                  className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  {isDraft && (
                    <div className="w-full">
                      <div className="flex items-center justify-between mb-1 px-1">
                        <span className="text-[10px] font-semibold text-[#8e8e93] uppercase tracking-wide">Draft — needs review</span>
                        {msg.content && (
                          <button
                            onClick={() => { navigator.clipboard.writeText(msg.content); setCopiedIndex(i); setTimeout(() => setCopiedIndex(null), 2000) }}
                            className="flex items-center gap-1 text-[10px] text-[#8e8e93] hover:text-[#1d1d1f] transition-colors"
                          >
                            {copiedIndex === i ? <Check className="w-3 h-3 text-[#34c759]" /> : <Copy className="w-3 h-3" />}
                            {copiedIndex === i ? 'Copied' : 'Copy'}
                          </button>
                        )}
                      </div>
                      <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-md text-[14px] leading-relaxed break-words bg-[#fffbeb] text-[#1d1d1f]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                  {!isDraft && (
                    <div className={cn('flex flex-col', msg.role === 'user' ? 'items-end' : 'items-start', 'max-w-[80%]')}>
                      <div
                        className={cn(
                          'px-3.5 py-2.5 rounded-2xl text-[14px] leading-relaxed break-words w-full',
                          msg.role === 'user'
                            ? 'bg-[#007aff] text-white rounded-br-md whitespace-pre-wrap'
                            : 'bg-[#f2f2f7] text-[#1d1d1f] rounded-bl-md',
                        )}
                      >
                        {msg.role === 'user' ? (
                          msg.content
                        ) : msg.content ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                            {msg.content}
                          </ReactMarkdown>
                        ) : streaming && i === messages.length - 1 ? (
                          <span className="inline-flex gap-1 items-center h-4">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#8e8e93] animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-[#8e8e93] animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-[#8e8e93] animate-bounce" style={{ animationDelay: '300ms' }} />
                          </span>
                        ) : null}
                      </div>
                      {msg.role === 'assistant' && msg.content && !streaming && (
                        <button
                          onClick={() => { navigator.clipboard.writeText(msg.content); setCopiedIndex(i); setTimeout(() => setCopiedIndex(null), 2000) }}
                          className="flex items-center gap-1 mt-1 px-1 text-[10px] text-[#c7c7cc] hover:text-[#8e8e93] transition-colors"
                        >
                          {copiedIndex === i ? <Check className="w-3 h-3 text-[#34c759]" /> : <Copy className="w-3 h-3" />}
                          {copiedIndex === i ? 'Copied' : 'Copy'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 pt-3">
        <div className="flex items-end gap-2 bg-white border border-[#e5e5ea] rounded-2xl px-3.5 py-2.5 shadow-sm focus-within:border-[#007aff] transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder={ROLE_PLACEHOLDERS[role]}
            rows={1}
            disabled={streaming}
            className="flex-1 resize-none bg-transparent text-[14px] text-[#1d1d1f] placeholder:text-[#8e8e93] outline-none leading-relaxed overflow-y-auto"
            style={{ maxHeight: '120px', minHeight: '22px' }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || streaming}
            className={cn(
              'shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors mb-0.5',
              input.trim() && !streaming ? 'bg-[#007aff] hover:bg-[#0071e3]' : 'bg-[#c7c7cc]',
            )}
          >
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
        <p className="text-center text-[10px] text-[#c7c7cc] mt-1.5 pb-1">
          Powered by local Gemma 4 · {(kbData as any).entryCount} knowledge entries
        </p>
      </div>

    </div>
  )
}
