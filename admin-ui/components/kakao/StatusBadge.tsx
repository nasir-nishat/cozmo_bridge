import { Badge } from '@/components/ui/badge'

export function StatusBadge({ status }: { status?: string }) {
  if (status === 'CHECKED_IN') return <Badge variant="success">Checked In</Badge>
  if (status === 'BOOKED' || status === 'PAID_IN_FULL') return <Badge variant="info">Booked</Badge>
  if (!status) return <Badge variant="outline">No Booking</Badge>
  return <Badge variant="secondary">{status}</Badge>
}
