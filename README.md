# skills

Claude Code plugins by Wittakarn Keeratichayakorn, published as a plugin marketplace.

## Plugins

| Plugin | Skills | What it does |
|---|---|---|
| [business-rules](plugins/business-rules/) | `extract-business-rules`, `guard-business-rules` | Extract a feature's business rules from code and confirm them with a human as numbered guardrails, then install a PreToolUse hook that asks a human before Claude changes, deletes or moves a test or source line that protects an active rule. |

## Install

From a terminal:

```
claude plugin marketplace add wittakarn/skills
claude plugin install business-rules@wittakarn-skills --scope user
```

Or inside Claude Code:

```
/plugin marketplace add wittakarn/skills
/plugin install business-rules@wittakarn-skills
```

`--scope user` installs for you in every project. Use `--scope project` to share the plugin with everyone on a repo through its `.claude/settings.json`.

To get new versions, run `claude plugin marketplace update wittakarn-skills`.

If you installed the older `extract-business-rules` or `guard-business-rules` plugins, uninstall them after installing `business-rules`, so each skill is loaded only once:

```
claude plugin uninstall extract-business-rules@wittakarn-skills
claude plugin uninstall guard-business-rules@wittakarn-skills
```

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

To add a skill to an existing plugin, add a folder under its `skills/`. To add a new plugin, create a folder under `plugins/` with the same layout and add an entry to `marketplace.json`.

When you change a plugin, bump `version` in its `plugin.json` so installed copies pick up the change.

## License

MIT. See [LICENSE](LICENSE).
