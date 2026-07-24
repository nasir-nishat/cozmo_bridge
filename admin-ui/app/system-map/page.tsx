'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Network } from 'lucide-react'
import { SYSTEM_MAP_MD, LAST_UPDATED } from './content'

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
  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <div className="mb-5 flex items-center gap-2.5">
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

      <div className="rounded-xl border border-[#E2DCC6] bg-white p-5 md:p-7">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>
          {SYSTEM_MAP_MD}
        </ReactMarkdown>
      </div>

      <p className="mt-4 text-[11px] text-[#867970]">
        Keep this updated: edit <code className="font-mono">app/system-map/content.ts</code>.
      </p>
    </div>
  )
}
