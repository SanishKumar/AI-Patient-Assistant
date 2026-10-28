import { NextResponse } from 'next/server'

// Keep the legacy endpoint closed until identity, record access, and clinical review are enforced.
export async function POST() {
  return NextResponse.json(
    { error: 'Clinical chat is unavailable. Use the synthetic record workspace to explore source evidence.' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
