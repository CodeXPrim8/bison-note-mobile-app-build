import { Card } from '@/components/ui/card'

export default function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h1 className="text-3xl font-bold">{title}</h1>
      <Card className="mt-6 p-6 text-muted-foreground">{body}</Card>
    </div>
  )
}
