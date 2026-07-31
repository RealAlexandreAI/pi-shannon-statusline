<div align="center">

<img src="https://raw.githubusercontent.com/RealAlexandreAI/pi-shannon-statusline/master/shannon-statusline.png" alt="pi-shannon-statusline preview" width="100%" />

# pi-shannon-statusline

**Cyberpunk terminal HUD for [Pi](https://github.com/earendil-works/pi-coding-agent)**

Ported from [shannon-statusline](https://github.com/RealAlexandreAI/shannon-statusline) (Claude Code).

</div>

---

## What you get

A live cyberpunk HUD rendered below every Pi response:

```
⌘ ~/D/project  │  ⎇ main* ↑2 !3 +1  │  ↺ loop ×12  │  ✦ 12m
↑ deepseek / deepseek-v4-pro  │  ⊡ ████████░░░░ 65% (200k)  │  ↑ 36k
※ ×3 AGENTS.md  │  ⊕ ×4 MCPs  │  ×5 skills
─────────────────────────────────────────────────────────────
✔ read ×12  │  ✔ edit ×7  │  ✔ bash ×4
↻ bash: src/index.ts (3s)
─────────────────────────────────────────────────────────────
↻ agent (3s)  │  ✔ agent ×2
```

Matrix katakana rain on the left. Monokai Pro palette. Plug and play - optional config for the matrix rain.

---

## Install

```bash
pi install npm:pi-shannon-statusline
```

Or from source:

```bash
git clone https://github.com/RealAlexandreAI/pi-shannon-statusline.git
cd pi-shannon-statusline && pi install .
```

---

## Configuration

Optional. Defaults work with zero config, but you can customize the matrix rain via `~/.pi/agent/shannon-statusline.json`:

```json
{
  "rain": false,
  "rainChars": "0123456789λΨΩΔΦABCDEFGH"
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `rain` | boolean | `true` | Enable the left-side matrix rain column |
| `rainChars` | string | katakana + digits + greek | Character set picked at random for the rain |

> **Font note:** the default rain uses half-width katakana (`ｦｧｨｩ…`) which require a CJK-capable font. If you see tofu boxes (乱码), either install a CJK font (e.g. [Sarasa Mono](https://github.com/be5invis/Sarasa-Gothic)), set `rainChars` to characters your font supports, or set `"rain": false`.

Config is re-read on every HUD refresh, so changes take effect on the next refresh — no `/reload` needed.

## Features

| Section | Content |
|---|---|
| **Project + Git** | CWD (fish-style abbreviation), branch, dirty, ahead/behind, file changes |
| **Turn count** | `↺ loop ×N` between git and duration |
| **Model + Context** | Provider / model name, context bar with percentage, token count |
| **Config counts** | AGENTS.md ×N, rules ×N, MCPs ×N, skills ×N |
| **Tool activity** | Completed tool counts, running tools with elapsed time |
| **Agent activity** | Running agent timer, completed agent count |
| **Matrix rain** | 6-column animated katakana rain (configurable) |

## Pi-native advantages

- **Live context API** — reads `getContextUsage()` directly, no stdin parsing
- **Widget rendering** — uses `ctx.ui.setWidget()` below the editor
- **Session-aware** — resets on `/new`, `/resume`, `/fork`
- **Model auto-detection** — updates on `model_select` event
- **Tool/agent tracking** — hooks `tool_call`, `tool_result`, `agent_start`, `agent_end`
- **Zero config by default** - install and go, optional JSON for the rain

## Testing

```bash
node --test src/__tests__/hud.test.ts
```

## License

MIT — based on [shannon-statusline](https://github.com/RealAlexandreAI/shannon-statusline) (MIT)
