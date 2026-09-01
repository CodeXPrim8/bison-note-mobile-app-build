'use client'

import { use } from 'react'
import { AccessGate } from '@/components/web/access-gate'

export default function CheckinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <AccessGate eventId={id} />
}
