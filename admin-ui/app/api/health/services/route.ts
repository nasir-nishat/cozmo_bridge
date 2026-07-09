type ServiceConfig = {
  name: string
  label: string
  mark: string
  localUrl: string
  publicUrl: string
  target: string
}

const SERVICES: ServiceConfig[] = [
  {
    name: 'bridge',
    label: 'Bridge',
    mark: 'BR',
    localUrl: process.env.BRIDGE_URL || 'http://127.0.0.1:3001/admin/health',
    publicUrl: 'https://webhook.coze.care',
    target: ':3001',
  },
  {
    name: 'admin',
    label: 'Admin UI',
    mark: 'AD',
    localUrl: 'http://127.0.0.1:3002',
    publicUrl: 'https://admin.coze.care',
    target: ':3002',
  },
  {
    name: 'owner',
    label: 'Owner Site',
    mark: 'OW',
    localUrl: 'http://127.0.0.1:3011',
    publicUrl: 'https://owner.coze.care',
    target: ':3011',
  },
  {
    name: 'client',
    label: 'Client Site',
    mark: 'CL',
    localUrl: 'http://127.0.0.1:8080',
    publicUrl: 'https://coze.care',
    target: ':8080',
  },
  {
    name: 'cms',
    label: 'CMS',
    mark: 'CM',
    localUrl: 'http://127.0.0.1:1337',
    publicUrl: 'https://cms.coze.care',
    target: ':1337',
  },
]

async function checkService(service: ServiceConfig) {
  const startedAt = Date.now()

  try {
    const res = await fetch(service.localUrl, {
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(3000),
    })

    return {
      ...service,
      online: res.status < 500,
      statusCode: res.status,
      latencyMs: Date.now() - startedAt,
    }
  } catch (err: any) {
    return {
      ...service,
      online: false,
      statusCode: null,
      latencyMs: Date.now() - startedAt,
      error: err?.message || 'Unavailable',
    }
  }
}

export const dynamic = 'force-dynamic'

export async function GET() {
  const services = await Promise.all(SERVICES.map(checkService))
  return Response.json({ ok: true, services, ts: Date.now() })
}
