---
name: extract-business-rules
description: Extract and pin down the business rules of a specific feature (pricing, discounts, validations, permissions, workflow/state rules, calculations) by reading the code and interviewing the user, then record them as numbered, confirmed guardrails in a business-rules/ folder so future AI edits or migrations don't silently drop them, and mark which rules are ready to have tests written. Use this whenever the user wants to capture, document, protect, guard, or "lock in" the business logic of a feature, prepare a feature for refactoring or migration to another project/stack, asks "what are the rules of feature X", worries that AI might remove important logic, or wants to know which behavior actually deserves tests — even if they don't say "business rules".
---

# Extract business rules

Code mixes two kinds of logic: **business rules** (what the business promised: "upgrade price = new price − old price, never negative") and **implementation detail** (how this code happens to do it: loop order, variable names, which AJAX endpoint). Refactors and migrations may freely change the second kind and must preserve the first. AI agents can't tell them apart from code alone, so they drop real rules while "cleaning up". This skill makes the first kind explicit, confirmed by a human, and stable enough to test against.

The output is a spec of record. If the code and a confirmed rule disagree after confirmation, the rule wins until a human says otherwise.

**Extract only. Never suggest improvements.** Record what the feature does today, including behavior that looks odd, inconsistent, or insecure. Don't propose fixes, don't ask "should this be enforced or changed?", and don't label behavior as a bug. Improvement is a separate decision for the user to make later. Mixing it in turns an inventory into a redesign, and a migration that "improves" things on the way is exactly how behavior gets lost.

## Where things go

- **Rules home** = the project the skill is running in (cwd). Write to `business-rules/` at its root.
- **Source code** = the project that implements the feature. Usually the same as cwd, but the user may point to another path (e.g. running from a migration project that reads the legacy app). Ask if it's unclear.

```
business-rules/
  README.md            # index of features + status legend (create once)
  <feature-slug>.md    # one file per feature
```

## Workflow

### 1. Scope the feature

Get from the user: the feature name, where it starts (a page, endpoint, button, job), and the source path if it isn't cwd. Record the source repo's current commit (`git -C <src> rev-parse --short HEAD`), because line references drift as the code changes.

If `business-rules/<feature-slug>.md` already exists, read it first. You are updating it, not starting over (see "Re-running" below).

### 2. Trace the code

Follow the feature end to end, from the entry point through calculations, conditions, validations, and persistence, including the JS and server sides if both exist.

**Stay inside the scope the user named.** The feature is its entry point, plus the files it includes, the endpoints it calls, and the classes those call (e.g. a page → its form include → its save endpoint → the model and any external sync). Other features that merely read the same data or reuse the same class, such as a different page that searches the same table, are out of scope. Don't draft rules from them or mention them in questions. Wandering into a neighbouring feature confuses the user and dilutes the review. If something is borderline, ask in one line before tracing it. If the repo has a code index (e.g. `.codegraph/`), use it. Shared helpers matter: a rule enforced in one shared function protects every caller, and it gets lost if someone inlines or bypasses that function. Trace a shared helper only as far as the path the feature uses, and record what it does there. Don't list its other callers or what it does for them.

Collect candidates wherever the code makes a decision with business meaning:
- arithmetic on money, quantities, dates, or percentages, including rounding and order of operations
- conditions that change outcomes (`if status == ...`, thresholds, limits, defaults)
- validations and what happens on failure
- who may do what (roles, ownership)
- state transitions and what is forbidden
- side effects the business relies on (records created, numbers generated, notifications)

### 3. Separate rules from implementation detail

For each candidate, ask: **would a user, customer, or business owner notice or care if this behavior changed?** If yes, it's a rule candidate. If only a developer would notice, drop it.

Screen features are not business rules even though users notice them: keyboard shortcuts, redirects and their delays, which page shows next, message wording, and layout. The business never promised them, and a migration may redesign them freely. List them under "Not rules" as features. Validations, defaults, and who can see or edit a field are not screen features in this sense; those stay rule candidates.

| Business rule (keep) | Implementation detail (drop) |
|---|---|
| Invoice number format `INV-YYYYMM-####`, resets monthly | Number is generated in a `NumberService` helper |
| Tax is applied after the discount, not before | Tax rate is held in a variable named `taxRate` |
| A booking can't be cancelled less than 24h before start | The check lives in the controller, not the model |
| After saving, the record has exactly the child items shown on screen | Saving deletes all child rows and re-inserts them with sequence 1..n |

State the rule as the **outcome** a user can observe, not the mechanism that produces it. Persistence strategies (delete-and-reinsert, upsert, soft vs hard row handling inside a save), sequence or ID numbering, and request shapes are usually implementation detail, even when they sit right next to the rule. When a candidate mixes the two, keep the outcome as the rule and list the mechanism under "Not rules".

Odd-looking behavior (two paths that apply the "same" rule differently, a check done only in the UI, a success message shown after a failure) is still current behavior. Describe it factually in the rule's **Notes** or in the plain-words line ("only the form enforces this; the server accepts any value") with no judgement and no fix. A reader then knows exactly what to reproduce.

### 4. Draft the rules

Write each rule in plain business language that someone who never saw the code could check. Give it a stable ID `BR-<FEATURE>-<NNN>` and status `draft`. Pull concrete numbers from the code into examples where you can.

### 5. Interview the user

The code is the source of truth for what the feature does today. The interview checks two things only: is your reading of the code right, and is this a business rule? Don't ask about business intent or whether the business relies on the behavior. The user may not know, and today's behavior is the spec either way.

**One rule per question, one question per turn.** Show one rule with its evidence, ask about that rule only, and wait for the answer before moving on. Stacking several rules or questions makes the user lose track of which evidence goes with which question, and they end up skimming or approving everything at once. Before the first question, say how many rules there are in total (e.g. "16 rules, most important first") and number each one as you go ("Rule 5 of 16"), so the user always knows where they are. Ask the highest-impact rules first, in case the user stops partway.

**Assume the user has not read this code.** Often they own the business but not this code, or wrote it years ago. A bare claim like "gold members get free shipping" asks them to trust your reading, so they can't really confirm it, and a rubber-stamped wrong rule becomes a guardrail. For every rule, show the evidence *before* asking:

- **Where:** clickable `/absolute/path/to/file.ext:line` references, one per place inside the feature where the rule is enforced (UI and server). Use absolute paths, because the source project is often not the cwd and relative links would break.
- **Code:** the few lines that decide the behavior, quoted verbatim in a code block. Keep it to the deciding lines, not the whole function. When the rule is a long list (field mappings, required fields, option lists), show a short table instead: item → value → `file:line`.
- **In plain words:** what those lines do, one or two sentences, using business terms. Also say what is *not* in the code when that matters (e.g. "the server doesn't check the role; only the form field is readonly").
- **What to check:** usually just "is that reading of the code right?". Name a specific point only when the reading hinges on it ("does status `H` mean *on hold*?").

Example:

> **Rule 3 of 12 · BR-ORD-003 · Free shipping threshold**
> Where: `/path/to/src/orders/pricing.ts:42` (checkout), `/path/to/src/orders/OrderForm.tsx:118` (cart display)
> ```ts
> const shipping = subtotalAfterDiscount >= 1000 ? 0 : SHIPPING_FEE;
> ```
> In plain words: shipping is free when the order total *after discounts* reaches 1,000. An order of 1,050 with a 100 discount pays shipping.
> Check: is that reading of the code right?
>
> Reply: confirm · wrong (say what) · not a rule · skip

Ask in plain chat text, not with a multiple-choice/popup question tool. A popup can't render clickable links or code, and it covers the evidence the user needs to read. Close with the answer choices on one line, as in the example, so a short reply works. "Wrong" means your reading of the code was wrong, not that the behavior should change. Avoid the word "correct" as a choice, because it also means "yes, that's right".

Answer edge cases (zero, empty, duplicates) from the code yourself. Some behavior depends on facts outside the code, such as a database default, a config value, or what an external system does. List those as open questions rather than guessing. If the user supplies one, record it in the rule's Notes with its source and date ("stated by user 2026-10-11, not visible in the code").

When the user answers **not a rule**, even for a rule already confirmed, remove it from Rules and add it to "Not rules" with "(was BR-…; ID retired)".

Only the user can move a rule to `confirmed`. Leave anything unanswered as `draft`. A guessed rule presented as confirmed is worse than none.

### 6. Mark test-readiness

A rule is `test-ready` when it is confirmed **and** has at least one example with exact inputs and an unambiguous expected output, including one boundary case where relevant. If the expected output depends on something unknown, the rule stays `confirmed` and you list the open question.

Statuses: `draft` → `confirmed` → `test-ready` → `tested` (set later, once a test referencing the ID exists). `deprecated` is used when the business drops a rule.

### 7. Write the file and the guardrail pointer

Write `business-rules/<feature-slug>.md` using the template below, and add or refresh the feature's row in `business-rules/README.md`.

If cwd is also the source project, make sure its `CLAUDE.md` (create it if missing) contains a pointer, so every future session sees the guardrail before editing:

```markdown
## Business rules (guardrails)
Before changing code for a feature listed in `business-rules/README.md`, read that feature's rules file.
Do not remove or alter behavior covered by a `confirmed`/`test-ready`/`tested` rule without explicit user approval; say which rule ID is affected.
```

Finish with a short summary in chat: counts per status, the test-ready IDs, and the open questions.

## Feature file template

```markdown
# <Feature name>

- Source: <repo path or name> @ <commit sha>
- Entry points: <page / endpoint / UI action>
- Last reviewed: <YYYY-MM-DD> with <who confirmed>

## Rules

### BR-<FEATURE>-001 — <short title>
- **Status:** draft | confirmed | test-ready | tested | deprecated
- **Rule:** <one or two sentences in business language>
- **Why:** <business reason if the user gave one, otherwise "as the code does it">
- **Examples:**
  - Given <concrete state>, when <action>, then <exact expected result>
  - Given <boundary case>, when ..., then ...
- **Source:** `path/to/file.ext:120-145` (`functionName`), `path/to/ui-file.ext:88`
- **Notes:** <open questions, related rules, known inconsistencies>

## Open questions
- <question> (affects BR-...)

## Not rules (deliberately excluded)
- <behavior> — implementation detail, safe to change
```

The "Not rules" section matters: it tells future agents, and migrations, what they are free to change.

## Re-running on an existing feature

- Never renumber or reuse IDs, because tests and other files reference them. New rules get the next number.
- Don't delete rules the business dropped. Set them to `deprecated` with a note.
- Re-check `Source` lines against the new commit and update the SHA.
- If the code no longer matches a confirmed rule, don't "fix" the rule to match the code. Report it as a possible regression and ask.
