---
name: guard-business-rules
description: Install a Claude Code PreToolUse hook in a repo that already has business rules (business-rules/*.md with BR-<FEATURE>-<NNN> IDs, from extract-business-rules), so any AI edit, rewrite, delete or move of a unit test or cited source line that protects an active rule stops and asks a human to approve. Detects the repo's languages and test frameworks (C#/xUnit/NUnit/MSTest, TS/JS Jest/Vitest, Python pytest, Java/Kotlin JUnit, Go, PHP, Swift, Dart, Scala) and installs a dependency-free Node script that checks per test block. Use this whenever the user wants to enforce, guard, protect, lock or gate business-rule tests, stop Claude from changing or deleting BR tests, add a pre-tool-use hook or guardrail for business rules, or "make the rules stick" after extracting them — even if they don't say "hook".
---

# Guard business rules

`extract-business-rules` writes rules down and has a human confirm them. Tests then pin each rule by carrying its ID (`[Trait("BR", "BR-ORD-003")]`, `it('BR-ORD-003 …')`, `// BR-ORD-003`). A rule is still easy to lose: an agent "fixing" a failing test can rewrite the assertion, delete the test, or change the source line the rule lives in. A note in CLAUDE.md is advice, not a gate.

This skill installs a gate. The repo gets a PreToolUse hook. When Claude is about to change a test or a source line that protects an **active** rule, the hook returns `ask`, and the human sees a permission prompt naming the rule before anything changes. Everything else passes untouched, so the hook stays quiet enough that people keep it on.

You install and verify the guard. You don't edit tests, rules or source code. Today's tests are the spec this guard protects.

## What the hook does

| Situation | Result |
|---|---|
| Edit/Write changes a test block tagged with an active ID (`confirmed`, `test-ready`, `tested`, or any status not listed below) | **ask** |
| Edit removes the ID from a test, or Write drops the test | **ask** |
| Test is tagged with an ID that isn't in `business-rules/` (typo, missing file) | **ask**, reason says "not found in business-rules/" |
| Edit changes lines cited by an active rule's `Source:` field (`src/Pricing.cs:9-13`; no line range = whole file) | **ask** |
| Bash/PowerShell deletes, moves or writes such a file (`rm`, `mv`, `sed -i`, `> file`, `git rm`/`checkout`/`restore`, `Remove-Item`, …) | **ask** (best effort) |
| Test for a `draft`, `deprecated` or retired ("(was BR-…; ID retired)") rule | no prompt |
| New test added, untagged test edited, whitespace-only change | no prompt |
| The hook can't parse its input or config | **ask** (fails safe) |

The hook reads `business-rules/` on every call, so new rules and status changes take effect without reinstalling. The test layout (globs, languages) lives in the config, so it needs re-running only when that changes.

"Per test block" means the script finds the test the ID belongs to: the attributes, decorators and comments above it, its signature and its body. For a container (a `describe('BR-…')`, or a class-level `[Trait]`), that means the whole container. Only that block is guarded, not the rest of the file. An ID outside any test (a file header comment, a module docstring) guards the whole file.

## Files

- `scripts/br-guard.cjs` is the hook. It's copied into the target repo. Modes: hook (reads stdin), `--scan` (lists what is protected) and `--selftest` (simulates edits against the repo's own files).
- `scripts/detect.cjs` surveys a repo and prints JSON: languages, frameworks, where IDs sit, unknown IDs, and a suggested config.

Both are plain Node with no dependencies, using `.cjs` so they also run in repos whose `package.json` says `"type": "module"`.

## Workflow

### 1. Check the preconditions

- **Target repo** = cwd unless the user names another path. Call it `<repo>` below.
- `node --version` must work (Node 16+). The hook runs on every developer machine that uses Claude Code in this repo, so mention that Node is now a requirement for them.
- `<repo>/business-rules/` should exist. If it doesn't, say so and suggest running `extract-business-rules` first. Without it every tagged test counts as an unknown ID and prompts. Install anyway only if the user asks.

### 2. Survey the repo

```bash
node <skill-dir>/scripts/detect.cjs <repo>
```

Read the JSON and check it against the repo yourself. Open one or two tagged test files, because the detector guesses from file names and markers:

- **languages**: is every language with tagged tests listed? `parser: "whole file"` means the language has no per-test parser (for example Ruby or Rust). Those files fall back to whole-file guarding: any edit to a tagged file prompts. Tell the user this is coarser.
- **suggestedConfig.tests**: do the `include` globs cover all test projects and nothing else? Add the test project folders for repos like `tests/Foo.Tests/**/*.cs` where file names don't end in `Tests.cs`. Production code doesn't belong in `tests`, because cited source lines are guarded via `Source:` instead.
- **idPlacement**: shows how the team tags tests (attribute, comment, method name, test-name string). All of these are recognised. `BR_ORD_003` in a C# or Python method name counts as `BR-ORD-003`.
- **unknownIdsInTests**: these will prompt. Usually they're typos. List them for the user, but don't fix them. Fixing them is their call.
- **idsOutsideTests**: production files that mention BR IDs. They're not guarded unless a rule's `Source:` cites them. Mention them.

### 3. Confirm with the user

In one message, show what will be protected and how, then ask to proceed. Include the language and framework, the include globs, the counts (protected tests, protected source ranges, tagged tests left unprotected because their rule is draft or deprecated), the unknown IDs, and the files you will write. Keep it short. The user mainly needs to spot a wrong glob or a missing test project.

### 4. Install

1. Copy `scripts/br-guard.cjs` to `<repo>/.claude/hooks/br-guard.cjs`.
2. Write `<repo>/.claude/hooks/br-guard.config.json` from the confirmed config:

   ```json
   {
     "rulesDir": "business-rules",
     "tests": [
       { "language": "csharp", "include": ["**/*Tests.cs"], "exclude": ["**/bin/**", "**/obj/**"] }
     ],
     "protectSource": true,
     "guardShell": true
   }
   ```

   `language` is one of `csharp`, `java`, `kotlin`, `javascript`, `typescript`, `go`, `php`, `swift`, `dart`, `scala`, `python`, or `file` (whole-file fallback). Use one entry per language. `protectSource: false` turns off `Source:` line guarding, and `guardShell: false` turns off the Bash/PowerShell check. Set these only if the user asks. `idPattern` (a regex string) overrides the ID format, for a team that uses something other than `BR-<FEATURE>-<NNN>`.

3. Merge the hook into `<repo>/.claude/settings.json`. Create the file if it's missing. Keep every existing key and hook, and don't add a second copy if one already points at `br-guard.cjs`:

   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Edit|Write|MultiEdit|Bash|PowerShell",
           "hooks": [
             {
               "type": "command",
               "command": "node",
               "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/br-guard.cjs"],
               "timeout": 30,
               "onFailure": "block"
             }
           ]
         }
       ]
     }
   }
   ```

   Use the project `settings.json`, not `settings.local.json`, so the guard is committed and applies to the whole team. `onFailure: "block"` makes a missing `node` or a crash block the call instead of silently letting it through. `PowerShell` is in the matcher because on Windows Claude may run shell commands through PowerShell instead of Bash.

4. Add or refresh this section in `<repo>/CLAUDE.md`. Keep any existing "Business rules (guardrails)" section and add the paragraph under it:

   ```markdown
   ## Business rules (guardrails)
   Before changing code for a feature listed in `business-rules/README.md`, read that feature's rules file.
   Do not remove or alter behavior covered by a `confirmed`/`test-ready`/`tested` rule without explicit user approval; say which rule ID is affected.

   A PreToolUse hook (`.claude/hooks/br-guard.cjs`) asks for approval before any change to a test or cited source line of an active rule. When it prompts, tell the user which rule is affected and why the change is needed. If the user declines, keep the test as it is and fix the code instead.
   ```

   The hook can only say *what* is affected. This note tells Claude to explain *why* the change is needed, which is what the human needs to decide.

### 5. Verify

Run both modes from the repo:

```bash
node <repo>/.claude/hooks/br-guard.cjs --scan
node <repo>/.claude/hooks/br-guard.cjs --selftest
```

`--scan` should list every tagged test you expected, under the right test name and with the right status. If a tagged test is missing, or shows up as `(whole file)` when it shouldn't, the glob or the language is wrong. Fix the config and run it again. `--selftest` simulates edits against real files: an edit inside a protected test, removing an ID, `rm`, a read-only `cat`, an edit outside protected tests, and an edit to a cited source line. Every line should say PASS. If one fails, report it as it is; don't paper over it.

Also run one real hook call so the user sees what the prompt will say. Pipe a hook JSON with an `Edit` on a protected test into the script, and show the `permissionDecisionReason`.

### 6. Report

End with a short summary:
- the files written or changed (`.claude/hooks/br-guard.cjs`, `br-guard.config.json`, `.claude/settings.json`, `CLAUDE.md`), and that they should be committed together
- the counts: protected tests, protected source ranges, unprotected tagged tests (draft/deprecated), unknown IDs
- the self-test result
- the limits that apply to this repo: whole-file fallback languages; shell parsing is best effort (a script that edits files indirectly isn't caught); the hook guards Claude's tool calls, not human edits or CI. Also, Claude Code needs a recent version for `onFailure`; on older versions a missing `node` lets calls through.

Don't start a commit unless the user asks.

## Re-running

Re-run when the test layout changes (new test project, new language) or to update the script. Re-running copies the latest `br-guard.cjs` over the old one and rewrites the config after confirming it. It leaves `settings.json` alone if the hook entry is already there. Rule and status changes in `business-rules/` don't need a re-run.

## Troubleshooting notes for the user

- **A prompt appeared for a test they consider untagged.** An ID sits in a comment or string inside or above that test, or in a container around it (`describe`, a class-level attribute). `--scan` shows which region owns it.
- **No prompt where one was expected.** The file isn't matched by `tests[].include`, or the rule's status is `draft`/`deprecated`. Run `--scan`.
- **Removing the guard.** Delete the hook entry from `.claude/settings.json`. The script and config can stay.
