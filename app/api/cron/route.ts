import { NextResponse } from 'next/server'
import { runPipeline } from '@/lib/pipeline/run'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const result = await runPipeline('cron')
  return NextResponse.json(result)
}
