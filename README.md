# skills

Claude Code plugins by Wittakarn Keeratichayakorn, published as a plugin marketplace.

## Plugins

| Plugin | What it does |
|---|---|
| [extract-business-rules](plugins/extract-business-rules/) | Extract a feature's business rules from code, confirm them with a human one rule at a time, and record them as numbered guardrails for refactors and migrations. |

## Install

In Claude Code, add this repo as a marketplace, then install a plugin from it:

```
/plugin marketplace add /Users/wittakarnkeeratichayakorn/Projects/skills
/plugin install extract-business-rules@wittakarn-skills
```

Once the repo is on GitHub, others can add it with `/plugin marketplace add <owner>/<repo>`.

After pulling changes, run `/plugin marketplace update wittakarn-skills` to pick them up.

## Layout

```
.claude-plugin/marketplace.json     # lists the plugins in this repo
plugins/<plugin>/
  .claude-plugin/plugin.json        # plugin name, version, author
  README.md
  skills/<skill>/SKILL.md           # the skill itself
```

To add a skill, create a new folder under `plugins/` with the same layout and add an entry to `marketplace.json`.
