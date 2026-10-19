# Order pricing

- Source: . @ 3f2a9c1
- Entry points: `POST /orders/quote`, checkout page total
- Last reviewed: 2026-10-02 with Finance (Nok)

## Rules

### BR-ORD-001 — Discount is capped at 20%
- **Status:** tested
- **Rule:** A coupon can never take more than 20% off the subtotal.
- **Why:** as the code does it
- **Examples:**
  - Given subtotal 1,000 and a 30% coupon, when quoting, then the discount is 200.
  - Given subtotal 1,000 and a 20% coupon, when quoting, then the discount is 200.
- **Source:** `src/Orders/Pricing.cs:9-13` (`Discount`)
- **Notes:** —

### BR-ORD-002 — Tax is applied after the discount
- **Status:** test-ready
- **Rule:** VAT (7%) is charged on the subtotal after the discount, not before.
- **Why:** as the code does it
- **Examples:**
  - Given subtotal 1,000 and discount 100, when quoting, then tax is 63.00.
- **Source:** `src/Orders/Pricing.cs:15-18` (`Tax`)
- **Notes:** —

### BR-ORD-003 — Free shipping threshold
- **Status:** tested
- **Rule:** Shipping is free when the total after discount reaches 1,000.
- **Why:** as the code does it
- **Examples:**
  - Given 1,050 subtotal and 100 discount, when quoting, then shipping is 50.
  - Given 1,000 after discount, when quoting, then shipping is 0.
- **Source:** `src/Orders/Pricing.cs:20-23` (`Shipping`)
- **Notes:** —

### BR-ORD-004 — Gift wrap fee
- **Status:** draft
- **Rule:** Gift wrap adds 35 per item.
- **Why:** as the code does it
- **Examples:**
  - Given 2 wrapped items, when quoting, then the fee is 70.
- **Source:** `src/Orders/Pricing.cs:24` (`GiftWrap`)
- **Notes:** not yet confirmed with Finance.

### BR-ORD-006 — Loyalty bonus on orders over 5,000
- **Status:** deprecated
- **Rule:** Orders over 5,000 earned double loyalty points.
- **Why:** programme ended 2026-06.
- **Examples:**
  - Given 6,000 order, when paid, then points are doubled.
- **Source:** `src/Orders/Pricing.cs:26-27` (`LoyaltyMultiplier`)
- **Notes:** dropped by the business 2026-06-30.

## Open questions
- none

## Not rules (deliberately excluded)
- Quote response is cached for 60 seconds — implementation detail, safe to change
- Rounding helper lives in `Money.Round` (was BR-ORD-005; ID retired)
