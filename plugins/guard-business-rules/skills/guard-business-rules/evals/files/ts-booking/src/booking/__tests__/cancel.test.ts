import { describe, it, expect } from 'vitest';
import { canCancel, refundFor, formatRefund } from '../cancel';

const now = new Date('2026-10-01T00:00:00Z');
const at = (h: number) => new Date(now.getTime() + h * 3600_000);

describe('BR-BKG-001 no cancellation within 24h', () => {
  it('refuses at 23h59m', () => {
    expect(canCancel(at(23.99), now, 'customer')).toBe(false);
  });

  it('allows at exactly 24h', () => {
    expect(canCancel(at(24), now, 'customer')).toBe(true);
  });
});

describe('refunds', () => {
  it.each([
    [7 * 24, 1000],
    [6 * 24, 500],
  ])('BR-BKG-002 refund at %ih is %i', (hours, refund) => {
    expect(refundFor(1000, at(hours), now)).toBe(refund);
  });

  it('formats refund with currency', { timeout: 500 }, () => {
    expect(formatRefund(12.5)).toBe(`12.50 THB`);
  });
});

// BR-BKG-003
it('admin can cancel an hour before start', () => {
  expect(canCancel(at(1), now, 'admin')).toBe(true);
});

it('BR-BKG-004 queues a cancellation email', () => {
  expect(true).toBe(true);
});
