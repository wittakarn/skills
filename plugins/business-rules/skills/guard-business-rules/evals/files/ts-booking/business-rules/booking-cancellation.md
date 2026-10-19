# Booking cancellation

- Source: booking-api @ 91be0d2
- Entry points: `DELETE /bookings/:id`, "Cancel booking" button
- Last reviewed: 2026-09-21 with Ops (Ploy)

## Rules

### BR-BKG-001 — No cancellation within 24h of start
- **Status:** tested
- **Rule:** A booking cannot be cancelled when it starts in less than 24 hours.
- **Examples:**
  - Given a start 23h59m away, when cancelling, then it is refused.
  - Given a start exactly 24h away, when cancelling, then it is allowed.
- **Source:** `src/booking/cancel.ts:8-12` (`canCancel`)

### BR-BKG-002 — Refund is 100% more than 7 days out, otherwise 50%
- **Status:** tested
- **Rule:** Cancelling 7 or more days before start refunds the full price; otherwise half.
- **Examples:**
  - Given 7 days out and price 1,000, when cancelling, then refund is 1,000.
  - Given 6 days out and price 1,000, when cancelling, then refund is 500.
- **Source:** `src/booking/cancel.ts:14-17` (`refundFor`)

### BR-BKG-003 — Admins can cancel any time
- **Status:** confirmed
- **Rule:** Users with role `admin` bypass the 24h limit.
- **Examples:**
  - Given an admin and a start 1h away, when cancelling, then it is allowed.
- **Source:** `src/booking/cancel.ts:8-12`

### BR-BKG-004 — Cancellation email is sent
- **Status:** draft
- **Rule:** The customer gets a cancellation email.
- **Examples:**
  - Given a cancelled booking, then one email is queued.
- **Source:** `src/booking/cancel.ts`

## Not rules (deliberately excluded)
- Toast says "Booking cancelled" for 3 seconds — screen feature
