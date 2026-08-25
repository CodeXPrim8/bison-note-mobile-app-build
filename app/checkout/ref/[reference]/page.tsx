import { redirect } from 'next/navigation'

export default async function PayRefRedirect({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params
  redirect(`/pay/${reference}`)
}
