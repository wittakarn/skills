# skills

Claude Code plugins by Wittakarn Keeratichayakorn, published as a plugin marketplace.

## Plugins

| Plugin | What it does |
|---|---|
| [extract-business-rules](plugins/extract-business-rules/) | Extract a feature's business rules from code, confirm them with a human one rule at a time, and record them as numbered guardrails for refactors and migrations. |
| [guard-business-rules](plugins/guard-business-rules/) | Install a PreToolUse hook that asks a human before Claude changes, deletes or moves a test or source line that protects an active business rule. |

## Install

In Claude Code, add this repo as a marketplace, then install the plugins you want from it. `/plugin install` takes one plugin at a time, so run it once per plugin:

```
/plugin marketplace add wittakarn/skills
/plugin install extract-business-rules@wittakarn-skills
/plugin install guard-business-rules@wittakarn-skills
```

Or from a terminal, without opening Claude Code:

```
claude plugin marketplace add wittakarn/skills
claude plugin install extract-business-rules@wittakarn-skills --scope user
claude plugin install guard-business-rules@wittakarn-skills --scope user
```

`--scope user` installs for you in every project. Use `--scope project` to share a plugin with everyone on a repo through its `.claude/settings.json`.

The two work together: `extract-business-rules` records the rules as `BR-<FEATURE>-<NNN>` IDs, and `guard-business-rules` protects the tests and code that carry those IDs. Install only the one you need, or both.

To get new versions, run `/plugin marketplace update wittakarn-skills`.

When you change a plugin, bump `version` in its `plugin.json` so installed copies pick up the change.

## Layout

```
.claude-plugin/marketplace.json     # lists the plugins in this repo
plugins/<plugin>/
  .claude-plugin/plugin.json        # plugin name, version, author
  README.md
  skills/<skill>/SKILL.md           # the skill itself
  skills/<skill>/scripts/           # optional helper scripts the skill runs
  skills/<skill>/evals/             # optional eval cases and fixtures
```

To add a skill, create a new folder under `plugins/` with the same layout and add an entry to `marketplace.json`.
