# guard-business-rules

A Claude Code skill that installs a `PreToolUse` hook in a repo whose tests carry business-rule IDs (`BR-<FEATURE>-<NNN>`, as recorded by [extract-business-rules](../extract-business-rules/)). When Claude tries to change, delete or move a test or source line that protects an **active** rule, you get a permission prompt naming the rule.

## Why

Once rules are confirmed and tested, the common way to lose one is an agent "fixing" a failing test: it changes the assertion, deletes the test, or edits the cited source line. A note in `CLAUDE.md` is advice. A hook is a gate.

## Install

```
/plugin marketplace add wittakarn/skills
/plugin install guard-business-rules@wittakarn-skills
```

## Usage

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

## What prompts

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

## Checking the install

```
node .claude/hooks/br-guard.cjs --scan       # what is protected, and what isn't
node .claude/hooks/br-guard.cjs --selftest   # simulated edits against your own files
```

## Limits

- It guards Claude's tool calls only, not human edits or CI.
- Shell parsing is best effort. A script that edits files indirectly isn't caught.
- `onFailure: "block"` needs a recent Claude Code. On older versions a missing `node` lets calls through.

## Evals

`skills/guard-business-rules/evals/` holds three fixture repos (C#/xUnit, TypeScript/Vitest ESM, Python/pytest) and behavioural checks used with the `skill-creator` plugin.
