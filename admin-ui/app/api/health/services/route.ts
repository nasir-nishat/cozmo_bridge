type ServiceConfig = {
  name: string
  label: string
  mark: string
  checkUrl: string
  publicUrl: string
  target: string
  managed?: boolean // hosted on Vercel — always active, no health ping
}

const SERVICES: ServiceConfig[] = [
  {
    name: 'bridge',
    label: 'Bridge',
    mark: 'BR',
    checkUrl: process.env.BRIDGE_URL || 'http://127.0.0.1:3001/admin/health',
    publicUrl: 'https://webhook.coze.care',
    target: ':3001',
  },
  {
    name: 'admin',
    label: 'Admin UI',
    mark: 'AD',
    checkUrl: 'http://127.0.0.1:3002',
    publicUrl: 'https://admin.coze.care',
    target: ':3002',
  },
  {
    name: 'owner',
    label: 'Owner Site',
    mark: 'OW',
    checkUrl: 'https://owner.coze.care',
    publicUrl: 'https://owner.coze.care',
    target: 'Vercel',
  },
  {
    name: 'client',
    label: 'Client Site',
    mark: 'CL',
    checkUrl: 'https://www.coze.care',
    publicUrl: 'https://coze.care',
    target: 'Vercel',
    managed: true,
  },
  {
    name: 'cms',
    label: 'CMS',
    mark: 'CM',
    checkUrl: 'https://cms.coze.care',
    publicUrl: 'https://cms.coze.care',
    target: 'Vercel',
    managed: true,
  },
]

async function checkService(service: ServiceConfig) {
  if (service.managed) {
    return {
      ...service,
      online: true,
      statusCode: null,
      latencyMs: null,
    }
  }

  const startedAt = Date.now()

  try {
    const res = await fetch(service.checkUrl, {
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
