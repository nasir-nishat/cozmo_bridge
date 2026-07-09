import { NextRequest, NextResponse } from 'next/server'
import type { PropertyTask, TaskType } from '@/lib/types'

const LM_STUDIO = 'http://localhost:1234/v1'

const ALL_PROPERTIES = [
  'Joy of TEVA', 'Teva Retreat', 'Teva Wellness', 'Teva Aeris Garden',
  'Seongbuk Achae', 'Secret Garden', 'Breeze & Sunrise', 'Leeha',
  'Kelly Luxury', 'Kelly Ananda', 'Kelly Prana',
  'Yeonnam Lotus', 'Yeonnam Fish', 'Yeonnam Bird',
]

const VALID_TYPES = new Set<TaskType>(['pest_control', 'plant_watering', 'iot'])

function buildFallbackSuggestions(currentTasks: PropertyTask[]) {
  const covered = new Set(currentTasks.map(t => t.property))
  const uncovered = ALL_PROPERTIES.filter(p => !covered.has(p))

  const templates: Array<{ type: TaskType; title: (property: string) => string }> = [
    { type: 'plant_watering', title: property => `Water entry plants at ${property}` },
    { type: 'pest_control', title: property => `Inspect kitchen drains at ${property}` },
    { type: 'iot', title: property => `Check smart-lock battery at ${property}` },
    { type: 'plant_watering', title: property => `Water terrace planters at ${property}` },
    { type: 'pest_control', title: property => `Replace insect traps at ${property}` },
  ]

  return uncovered.slice(0, 3).map((property, index) => {
    const template = templates[index % templates.length]
    return {
      property,
      title: template.title(property),
      type: template.type,
    }
  })
}

async function getLoadedModel(): Promise<string> {
  const res = await fetch(`${LM_STUDIO}/models`, { signal: AbortSignal.timeout(5000) })
  const data = await res.json()
  return data.data?.[0]?.id ?? 'local-model'
}

export async function POST(req: NextRequest) {
  const { currentTasks } = await req.json() as { currentTasks: PropertyTask[] }

  const covered = new Set(currentTasks.map(t => t.property))
  const uncovered = ALL_PROPERTIES.filter(p => !covered.has(p))

  if (uncovered.length === 0) {
    return NextResponse.json({ tasks: [], message: 'All properties already have tasks.' })
  }

  const activeSummary = currentTasks.length
    ? currentTasks.map(t => `${t.property}: ${t.title} [${t.type}]`).join('\n')
    : 'None'

  const prompt = `You are a property operations assistant for COZE Hospitality, managing STR properties in Seoul.

ACTIVE TASKS:
${activeSummary}

PROPERTIES WITH NO TASKS (pick from these):
${uncovered.join(', ')}

Suggest exactly 2 new maintenance tasks for 2 different uncovered properties.

Task types allowed:
- pest_control: drain sprays, trap checks, cockroach/ant treatment, storage inspection
- plant_watering: indoor plants, rooftop garden, lobby planters, terrace pots

Rules:
- Only use properties listed in "PROPERTIES WITH NO TASKS"
- Be specific about the location within the property (kitchen, rooftop, lobby, etc.)
- Keep titles under 60 characters

Respond with ONLY a raw JSON array — no markdown, no explanation:
[{"property":"...","title":"...","type":"pest_control"}]`

  try {
    const model = await getLoadedModel()

    const res = await fetch(`${LM_STUDIO}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.6,
        max_tokens: 2000,
        stream: false,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: `LM Studio error ${res.status}: ${err}` }, { status: 502 })
    }

    const data = await res.json()
    const msg = data.choices?.[0]?.message ?? {}
    // Gemma 4 is a reasoning model — final answer goes to content, chain-of-thought to reasoning_content.
    // If content is empty (ran out of tokens mid-think), fall back to reasoning_content.
    const raw = (msg.content?.trim() || msg.reasoning_content?.trim() || '')

    // Strip markdown code fences if the model wrapped the JSON
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    // Extract first JSON array from the response
    const match = cleaned.match(/\[[\s\S]*?\]/)
    if (!match) {
      return NextResponse.json({ error: 'Model did not return a JSON array.', raw }, { status: 502 })
    }

    const parsed = JSON.parse(match[0]) as { property: string; title: string; type: string }[]

    const valid = parsed
      .filter(s =>
        typeof s.property === 'string' &&
        typeof s.title === 'string' &&
        ALL_PROPERTIES.includes(s.property) &&
        VALID_TYPES.has(s.type as TaskType) &&
        !covered.has(s.property),
      )
      .slice(0, 3)

    return NextResponse.json({ tasks: valid, model })
  } catch (err: any) {
    const fallback = buildFallbackSuggestions(currentTasks)
    const isOffline =
      err.message?.includes('ECONNREFUSED') ||
      err.message?.includes('fetch failed') ||
      err.name === 'TimeoutError'

    return NextResponse.json(
      {
        tasks: fallback,
        model: isOffline ? 'fallback-rules' : 'fallback-after-error',
        warning: isOffline ? 'LM Studio is not running on :1234' : err.message,
      },
    )
  }
}
