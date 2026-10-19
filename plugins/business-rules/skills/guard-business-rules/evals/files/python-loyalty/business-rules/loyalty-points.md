# Loyalty points

- Source: . @ 77c01aa
- Entry points: `loyalty.points.earn()` called by the checkout job
- Last reviewed: 2026-08-14 with CRM team

## Rules

### BR-LOY-001 — 1 point per 25 baht, rounded down
- **Status:** tested
- **Rule:** Members earn one point for every full 25 baht spent.
- **Examples:**
  - Given 99 baht, when earning, then 3 points.
  - Given 100 baht, when earning, then 4 points.
- **Source:** `loyalty/points.py:4-6` (`earn`)

### BR-LOY-002 — Gold members earn double
- **Status:** test-ready
- **Rule:** Gold tier doubles the points earned.
- **Examples:**
  - Given 100 baht and tier gold, when earning, then 8 points.
- **Source:** `loyalty/points.py:4-6`

### BR-LOY-003 — Points expire after 12 months
- **Status:** deprecated
- **Rule:** Points older than 12 months were removed.
- **Examples:**
  - Given points earned 2025-01-01, on 2026-01-02, then they are gone.
- **Notes:** expiry removed 2026-03.
