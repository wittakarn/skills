export type Role = 'customer' | 'admin';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const formatRefund = (n: number) => `${n.toFixed(2)} THB`;

export function canCancel(startsAt: Date, now: Date, role: Role): boolean {
  if (role === 'admin') return true;
  const ms = startsAt.getTime() - now.getTime();
  return ms >= 24 * HOUR;
}

export function refundFor(price: number, startsAt: Date, now: Date): number {
  const days = (startsAt.getTime() - now.getTime()) / DAY;
  return days >= 7 ? price : price / 2;
}
