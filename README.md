<p align="center">
  <img src="./shannon-statusline.png" alt="pi-shannon-statusline terminal HUD preview" width="100%" />
</p>

<h1 align="center">pi-shannon-statusline</h1>

<p align="center">
  Live ANSI HUD for <a href="https://github.com/earendil-works/pi-coding-agent">Pi</a> with project, model, context, throughput, tool, agent, and configuration state.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/pi-shannon-statusline"><img src="https://img.shields.io/npm/v/pi-shannon-statusline" alt="npm version" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/pi-shannon-statusline" alt="MIT license" /></a>
  <a href="https://github.com/RealAlexandreAI/shannon-statusline"><img src="https://img.shields.io/badge/companion-Claude_Code-8A2BE2" alt="Claude Code companion" /></a>
</p>

## Install

```bash
pi install npm:pi-shannon-statusline
```

From a checkout:

```bash
git clone https://github.com/RealAlexandreAI/pi-shannon-statusline.git
cd pi-shannon-statusline
pi install .
```

## HUD

The extension renders below the editor:

```text
⌘ ~/D/project  │  ⎇ main* ↑2 !3 +1  │  ↺ loop ×12  │  ↑ 36k  │  ✦ 12m
λ deepseek / deepseek-v4-pro  │  ⊡ ████████░░░░ 65% (200k)
» TTFT 1.24s  │  Decode ~42.1 tok/s · ~312 tok
※ ×3 AGENTS.md  │  ⊕ ×4 MCPs  │  ★ ×5 Skills
─────────────────────────────────────────────────────────────
✔ read ×12  │  ✔ edit ×7  │  ✔ bash ×4
↻ bash: src/index.ts (3s)
─────────────────────────────────────────────────────────────
↻ agent (3s)  │  ✔ agent ×2
```

## Configuration

Optional file: `~/.pi/agent/shannon-statusline.json`

```json
{
  "rain": true,
  "rainChars": "0123456789λΨΩΔΦ",
  "footer": false,
  "throughput": true
}
```

| Option | Type | Default | Effect |
|---|---|---:|---|
| `rain` | boolean | `true` | Show the matrix column. |
| `rainChars` | string | built-in set | Characters used by the matrix column. |
| `footer` | boolean | `true` | Show Pi's built-in footer and extension status rows. |
| `throughput` | boolean | `true` | Show response metrics on line 3. |

Configuration is read on every HUD refresh. `footer: false` hides Pi's footer without hiding the Shannon HUD.

## Metrics

- `TTFT`: time from `before_provider_request` to the first assistant delta.
- `Decode`: client-observed output rate; `~` marks an estimate.
- `Input/TTFT`: client-side input rate estimate.

## Requirements

Pi `>= 0.84.4`.

## Development

```bash
node --test src/__tests__/*.ts
```

## License

MIT
