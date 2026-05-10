import { Check, CheckCheck, Clock } from 'lucide-react';
import type { MessageItem } from '../api';

export type TickStatus = 'pending' | 'sent' | 'delivered' | 'read';

export function statusOf(m: MessageItem): TickStatus {
  if (m.id.startsWith('tmp-')) return 'pending';
  if (!m.receipts || m.receipts.length === 0) return 'sent';
  if (m.receipts.some((r) => r.readAt)) return 'read';
  if (m.receipts.some((r) => r.deliveredAt)) return 'delivered';
  return 'sent';
}

export function MessageTicks({ status, color = 'rgba(255,255,255,0.6)' }: { status: TickStatus; color?: string }) {
  const blue = '#5BB6F5';
  switch (status) {
    case 'pending':
      return <Clock size={11} color={color} />;
    case 'sent':
      return <Check size={13} color={color} />;
    case 'delivered':
      return <CheckCheck size={13} color={color} />;
    case 'read':
      return <CheckCheck size={13} color={blue} />;
  }
}
