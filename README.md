# pi-superpowers-adapter

> [!IMPORTANT]
> **This project is archived and no longer maintained.**
>
> Upstream [obra/superpowers](https://github.com/obra/superpowers) now supports Pi natively, so this adapter is no longer necessary. Install upstream Superpowers directly instead:
>
> ```bash
> pi install git:github.com/obra/superpowers
> ```

[![npm version](https://img.shields.io/npm/v/@tarmo-randma/pi-superpowers-adapter.svg)](https://www.npmjs.com/package/@tarmo-randma/pi-superpowers-adapter)

A small Pi package that gives Pi the upstream [obra/superpowers](https://github.com/obra/superpowers) skills without copying them into this repository.

Status: `v0.1.3` release. Tested with Pi `0.75.x`. Uses upstream Superpowers `v5.1.0`. Adds Pi startup guidance and a `skill` tool, but does not provide or replace a subagent extension.

## Install

Ask your agent to run this:

```text
Install this Pi package: pi install npm:@tarmo-randma/pi-superpowers-adapter@0.1.3
```

### Local checkout

If you are installing from a local clone instead of GitHub:

```bash
pi install /path/to/pi-superpowers-adapter
```

## Upstream version

To change the upstream Superpowers version, edit the `obra-superpowers` dependency in `package.json`, then update/reinstall the Pi package.

Example:

```json
"obra-superpowers": "https://github.com/obra/superpowers/archive/refs/tags/v5.1.0.tar.gz"
```

## Optional model tier config

Superpowers sometimes talks about Claude model tiers:

- `haiku` = cheap/fast
- `sonnet` = normal/default
- `opus` = heavy/strong

Pi does not have these tiers built in. By default, the adapter tells agents to use normal Pi model behavior.

If you want explicit mappings, create one of these files:

```text
~/.pi/agent/superpowers-adapter.json
.pi/superpowers-adapter.json
```

The user-level path follows Pi's active agent config directory. If Pi is started with `PI_CODING_AGENT_DIR`, the adapter reads `superpowers-adapter.json` from that directory instead of `~/.pi/agent`.

Project config overrides user config.

```json
{
  "models": {
    "cheap": "openai-codex/gpt-5.5",
    "default": "openai-codex/gpt-5.5",
    "heavy": "openai-codex/gpt-5.5"
  },
  "reasoning": {
    "cheap": "low",
    "default": "medium",
    "heavy": "high"
  }
}
```

Use exact Pi model IDs. To see the models available to Pi, run:

```bash
pi --list-models
```

Use the full `provider/model-id` form, for example `openai-codex/gpt-5.5`.

Reasoning values are Pi thinking levels: `off`, `minimal`, `low`, `medium`, `high`, or `xhigh`.

You can configure a model, a reasoning level, or both for each tier:

- model only: use that model with its normal/default reasoning
- reasoning only: use the currently active Pi model with that reasoning level
- both: use that model with that reasoning level

Invalid tiers are ignored. For example, if a configured model is unavailable, or a configured reasoning level is not supported by the chosen model, the adapter gives no guidance for that tier.

## Development

```bash
npm install
npm run typecheck
```
