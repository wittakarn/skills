# business-rules

A Claude Code plugin with two skills that keep a feature's business rules from getting lost in refactors and migrations:

| Skill | What it does |
|---|---|
| [extract-business-rules](#extract-business-rules) | Pulls the business rules out of one feature's code, confirms each one with you, and saves them as numbered rules (`BR-<FEATURE>-<NNN>`). |
| [guard-business-rules](#guard-business-rules) | Installs a `PreToolUse` hook so Claude has to ask before changing, deleting or moving a test or source line that protects an active rule. |

Use them in that order: extract the rules, tag the tests with the IDs, then guard them.

## Install

```
claude plugin marketplace add wittakarn/skills
claude plugin install business-rules@wittakarn-skills --scope user
```

Or inside Claude Code:

```
/plugin marketplace add wittakarn/skills
/plugin install business-rules@wittakarn-skills
```

---

## extract-business-rules

### Why

Code mixes **business rules** (what the business promised, e.g. "NV grades are saved without VAT") with **implementation detail** (how the code does it, e.g. which table or AJAX endpoint). An AI agent reading the code can't tell the two apart, so a refactor or migration can drop a real rule while "cleaning up". This skill writes the rules down, has a human confirm them, and makes them precise enough to test against.

It only extracts. It records what the feature does today, including odd or inconsistent behavior, and never suggests fixes.

### Usage

Ask in plain words. Name the feature and where it starts:

```
Extract the business rules of the create customer feature from /path/to/legacy-app/pages/customer.php
```

The skill also triggers on requests like "lock in the pricing logic before we migrate" or "what are the rules of the refund feature?".

The source code can live in another repo. A common setup is to run Claude from the new (migration) project and point it at the legacy app. Rules are written to the project Claude is running in.

### What happens

1. **Scope.** Finds the entry point and records the source repo's commit, since line numbers drift.
2. **Trace.** Follows the feature end to end (page → form → save endpoint → model → external sync) and stays inside it. Shared helpers are recorded only for the path this feature uses.
3. **Separate.** Keeps outcomes the business relies on, such as calculations, defaults, validations, permissions and side effects. Implementation details and screen features (keyboard shortcuts, redirects, message wording) go under "Not rules".
4. **Interview.** One rule per message, most important first ("Rule 3 of 14"). Each rule shows clickable file:line references, the deciding code (or a table for long lists), a plain-words reading, and one check. The code is treated as the source of truth, so the only question is whether the reading is right and whether it's a rule. Reply with `confirm`, `wrong (say what)`, `not a rule` or `skip`.
5. **Record.** Writes the rules file, updates the index, and summarises status counts and open questions.

### Output

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

---

## guard-business-rules

Installs a `PreToolUse` hook in a repo whose tests carry business-rule IDs. When Claude tries to change, delete or move a test or source line that protects an **active** rule, you get a permission prompt naming the rule.

### Why

Once rules are confirmed and tested, the common way to lose one is an agent "fixing" a failing test: it changes the assertion, deletes the test, or edits the cited source line. A note in `CLAUDE.md` is advice. A hook is a gate.

### Usage

In the repo to protect (it should already have `business-rules/`):

```
Set up a pretooluse hook so any change to our business rule tests needs my approval.
```

The skill surveys the repo, shows what it will protect, then writes:

```
.claude/hooks/br-guard.cjs           # the hook (Node, no dependencies)
.claude/hooks/br-guard.config.json   # languages + test globs
.claude/settings.json                # PreToolUse hook entry, onFailure: block
CLAUDE.md                            # tells Claude to explain the rule when the prompt appears
```

Commit them together so the whole team gets the guard.

### What prompts

| Change | Prompt? |
|---|---|
| Edit/Write inside a test tagged with an active rule (`confirmed`, `test-ready`, `tested`) | yes |
| Removing the ID from a test, or deleting the test | yes |
| Test tagged with an ID not found in `business-rules/` | yes |
| Lines cited in an active rule's `Source:` field | yes |
| `rm` / `mv` / `sed -i` / `> file` / `git rm` / `Remove-Item` … on such a file | yes (best effort) |
| Tests of `draft`, `deprecated` or retired rules | no |
| New tests, untagged tests, whitespace-only changes | no |
| Hook can't read its input or config | yes (fails safe) |

The check works per test block, not per file. It recognises the ID in attributes (`[Trait("BR", "BR-ORD-003")]`), decorators (`@pytest.mark.br("BR-…")`), comments, test-name strings (`it('BR-ORD-003 …')`), docstrings and method names (`BR_ORD_003_…`).

Per-test parsing: C# (xUnit, NUnit, MSTest), TypeScript/JavaScript (Jest, Vitest, Mocha, node:test), Python (pytest, unittest), Java/Kotlin (JUnit, Kotest), Go, PHP (PHPUnit, Pest), Swift, Dart, Scala. Other languages fall back to whole-file guarding.

Rules and statuses are read live from `business-rules/`, so confirming or deprecating a rule takes effect immediately.

### Checking the install

```
node .claude/hooks/br-guard.cjs --scan       # what is protected, and what isn't
node .claude/hooks/br-guard.cjs --selftest   # simulated edits against your own files
```

### Limits

- It guards Claude's tool calls only, not human edits or CI.
- Shell parsing is best effort. A script that edits files indirectly isn't caught.
- `onFailure: "block"` needs a recent Claude Code. On older versions a missing `node` lets calls through.

---

## Evals

Each skill has an `evals/` folder used with the `skill-creator` plugin:

- `skills/extract-business-rules/evals/evals.json`: a test prompt and 16 checks.
- `skills/guard-business-rules/evals/`: three fixture repos (C#/xUnit, TypeScript/Vitest ESM, Python/pytest) and behavioural checks.
