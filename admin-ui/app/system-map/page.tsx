'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Network, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { SYSTEM_MAP_MD, LAST_UPDATED } from './content'

// Everything an AI agent needs to understand this system before you ask it to do anything.
const AGENT_BRIEF = `I run COZE Hospitality (Seoul short-term rentals, 300+ properties). Below is the full system map of our COZMO AI ops platform. Read it end to end so you understand how the pieces fit together — the repos, hosting, data flow, secrets, and gotchas — before doing anything.

${SYSTEM_MAP_MD.trim()}

---
(System map last updated ${LAST_UPDATED}.) Once you've read it, give me a 2–3 sentence summary of what this system is, then wait for my task.`

const md = {
  h2: ({ children }: any) => (
    <h2 className="text-[15px] font-semibold mt-7 mb-2 text-[#B88E23] first:mt-0">{children}</h2>
  ),
  p: ({ children }: any) => <p className="mb-2.5 text-[13.5px] leading-relaxed">{children}</p>,
  strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: any) => <em className="italic opacity-80">{children}</em>,
  ul: ({ children }: any) => <ul className="list-disc pl-5 my-2 space-y-1 text-[13.5px]">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-5 my-2 space-y-1 text-[13.5px]">{children}</ol>,
  li: ({ children }: any) => <li className="leading-snug">{children}</li>,
  code: ({ children }: any) => (
    <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[12px]">{children}</code>
  ),
  pre: ({ children }: any) => (
    <pre className="my-3 overflow-x-auto rounded-lg bg-[#272525] p-3 font-mono text-[12px] leading-relaxed text-[#E8E2D0]">{children}</pre>
  ),
  table: ({ children }: any) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">{children}</table>
    </div>
  ),
  th: ({ children }: any) => (
    <th className="border border-[#E2DCC6] bg-[#F1EEE3] px-2.5 py-1.5 text-left font-semibold">{children}</th>
  ),
  td: ({ children }: any) => (
    <td className="border border-[#E2DCC6] px-2.5 py-1.5 align-top">{children}</td>
  ),
  a: ({ children, href }: any) => (
    <a href={href} className="text-[#B88E23] underline underline-offset-2" target="_blank" rel="noreferrer">{children}</a>
  ),
}

export default function SystemMapPage() {
  const [copied, setCopied] = useState(false)

  async function copyForAgent() {
    try {
      await navigator.clipboard.writeText(AGENT_BRIEF)
      setCopied(true)
      toast.success('System map copied — paste it into your AI agent')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copy failed — check clipboard permissions')
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-4 md:flex md:h-full md:flex-col md:p-6">
      <div className="mb-5 flex items-center justify-between gap-3 md:shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#B88E23]/70 bg-[#B88E23]/15 text-[#B88E23]">
            <Network className="h-[18px] w-[18px]" />
          </div>
          <div>
            <h1 className="text-[22px] font-bold leading-none">System Map</h1>
            <p className="mt-1 text-[11px] text-[#867970]">
              Full AX transformation overview · updated {LAST_UPDATED}
            </p>
          </div>
        </div>
        <button
          onClick={copyForAgent}
          title="Copy the whole system map (with an intro brief) so you can paste it into an AI agent and have it understand the setup before you ask it to do anything."
          className="shrink-0 flex items-center gap-1.5 rounded-md border border-[#B88E23]/40 bg-[#B88E23]/10 px-3 py-2 text-[12px] font-medium text-[#B88E23] transition-colors hover:bg-[#B88E23]/20"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy for AI agent'}</span>
        </button>
      </div>

      <div className="md:flex-1 md:min-h-0 md:overflow-y-auto">
        <div className="rounded-xl border border-[#E2DCC6] bg-white p-5 md:p-7">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>
            {SYSTEM_MAP_MD}
          </ReactMarkdown>
        </div>

        <p className="mt-4 text-[11px] text-[#867970]">
          Keep this updated: edit <code className="font-mono">app/system-map/content.ts</code>.
        </p>
      </div>
    </div>
  )
}
