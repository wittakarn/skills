# extract-business-rules

A Claude Code skill that pulls the business rules out of one feature's code, confirms each one with you, and saves them as numbered rules that later refactors and migrations must keep.

## Why

Code mixes **business rules** (what the business promised, e.g. "NV grades are saved without VAT") with **implementation detail** (how the code does it, e.g. which table or AJAX endpoint). An AI agent reading the code can't tell the two apart, so a refactor or migration can drop a real rule while "cleaning up". This skill writes the rules down, has a human confirm them, and makes them precise enough to test against.

It only extracts. It records what the feature does today, including odd or inconsistent behavior, and never suggests fixes.

## Install

```
/plugin marketplace add wittakarn/skills
/plugin install extract-business-rules@wittakarn-skills
```

## Usage

Ask in plain words. Name the feature and where it starts:

```
Extract the business rules of the create customer feature from /path/to/legacy-app/pages/customer.php
```

The skill also triggers on requests like "lock in the pricing logic before we migrate" or "what are the rules of the refund feature?".

The source code can live in another repo. A common setup is to run Claude from the new (migration) project and point it at the legacy app. Rules are written to the project Claude is running in.

## What happens

1. **Scope.** Finds the entry point and records the source repo's commit, since line numbers drift.
2. **Trace.** Follows the feature end to end (page → form → save endpoint → model → external sync) and stays inside it. Shared helpers are recorded only for the path this feature uses.
3. **Separate.** Keeps outcomes the business relies on, such as calculations, defaults, validations, permissions and side effects. Implementation details and screen features (keyboard shortcuts, redirects, message wording) go under "Not rules".
4. **Interview.** One rule per message, most important first ("Rule 3 of 14"). Each rule shows clickable file:line references, the deciding code (or a table for long lists), a plain-words reading, and one check. The code is treated as the source of truth, so the only question is whether the reading is right and whether it's a rule. Reply with `confirm`, `wrong (say what)`, `not a rule` or `skip`.
5. **Record.** Writes the rules file, updates the index, and summarises status counts and open questions.

## Output

```
business-rules/
  README.md          # index of features + status legend
  <feature>.md       # rules, open questions, and "Not rules"
```

Each rule has a stable ID (`BR-<FEATURE>-<NNN>`) and a status:

| Status | Meaning |
|---|---|
| `draft` | Read from the code, not yet confirmed |
| `confirmed` | A human confirmed the reading and that it's a rule |
| `test-ready` | Confirmed, with exact examples including a boundary case |
| `tested` | A test referencing the ID exists |
| `deprecated` | The business dropped it; kept for history |

IDs are never reused. A rule you mark "not a rule" moves to "Not rules" as "(was BR-…; ID retired)". Facts you supply that aren't in the code, such as a database default, are recorded with their source and date.

When the rules live in the same repo as the source code, the skill also adds a short pointer to that repo's `CLAUDE.md`, so future sessions read the rules before editing the feature.

## Evals

`skills/extract-business-rules/evals/evals.json` holds a test prompt and 16 checks used to validate the skill with the `skill-creator` plugin.
