<div align="center">

<img src="shannon-statusline.png" alt="pi-shannon-statusline preview" width="100%" />

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

Matrix katakana rain on the left. Monokai Pro palette. No config, no commands — plug and play.

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

## Features

| Section | Content |
|---|---|
| **Project + Git** | CWD (fish-style abbreviation), branch, dirty, ahead/behind, file changes |
| **Turn count** | `↺ loop ×N` between git and duration |
| **Model + Context** | Provider / model name, context bar with percentage, token count |
| **Config counts** | AGENTS.md ×N, rules ×N, MCPs ×N, skills ×N |
| **Tool activity** | Completed tool counts, running tools with elapsed time |
| **Agent activity** | Running agent timer, completed agent count |
| **Matrix rain** | 6-column animated katakana rain, always on |

## Pi-native advantages

- **Live context API** — reads `getContextUsage()` directly, no stdin parsing
- **Widget rendering** — uses `ctx.ui.setWidget()` below the editor
- **Session-aware** — resets on `/new`, `/resume`, `/fork`
- **Model auto-detection** — updates on `model_select` event
- **Tool/agent tracking** — hooks `tool_call`, `tool_result`, `agent_start`, `agent_end`
- **Zero config** — install and go

## Testing

```bash
node --test src/__tests__/hud.test.ts
```

## License

MIT — based on [shannon-statusline](https://github.com/RealAlexandreAI/shannon-statusline) (MIT)
