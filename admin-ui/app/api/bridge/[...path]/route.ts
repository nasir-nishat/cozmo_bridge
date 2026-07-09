const BRIDGE_URL = process.env.BRIDGE_URL || 'http://127.0.0.1:3001'

type RouteContext = {
  params: {
    path?: string[]
  }
}

function targetUrl(req: Request, pathParts: string[] = []) {
  const incoming = new URL(req.url)
  const path = pathParts.map(encodeURIComponent).join('/')
  return `${BRIDGE_URL}/${path}${incoming.search}`
}

function proxyHeaders(req: Request) {
  const headers = new Headers(req.headers)
  headers.delete('host')
  headers.delete('connection')
  headers.delete('content-length')
  return headers
}

async function proxy(req: Request, context: RouteContext) {
  const method = req.method.toUpperCase()
  const hasBody = !['GET', 'HEAD'].includes(method)
  const body = hasBody ? await req.text() : undefined

  try {
    const upstream = await fetch(targetUrl(req, context.params.path), {
      method,
      headers: proxyHeaders(req),
      body,
      cache: 'no-store',
    })

    const headers = new Headers(upstream.headers)
    headers.delete('content-encoding')
    headers.delete('content-length')

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    })
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message || 'Bridge unavailable' },
      { status: 502 },
    )
  }
}

export const dynamic = 'force-dynamic'

export async function GET(req: Request, context: RouteContext) {
  return proxy(req, context)
}

export async function POST(req: Request, context: RouteContext) {
  return proxy(req, context)
}

export async function PUT(req: Request, context: RouteContext) {
  return proxy(req, context)
}

export async function PATCH(req: Request, context: RouteContext) {
  return proxy(req, context)
}

export async function DELETE(req: Request, context: RouteContext) {
  return proxy(req, context)
}
