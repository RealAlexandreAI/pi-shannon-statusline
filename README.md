# pi-shannon-statusline

Cyberpunk terminal HUD for [Pi](https://github.com/earendil-works/pi-coding-agent) — ported from [shannon-statusline](https://github.com/RealAlexandreAI/shannon-statusline) (Claude Code).

```
⌘ ~/D/project  │  ⎇ main* ↑2 !3 +1  │  ✦ 12m
λ deepseek-v4-pro  │  ⊡ ████████░░░░ 65% (200k)  │  ↑ 36k  ↓ 300  ⊗ 8.5k
※ ×3 AGENTS.md  │  ⊕ ×4 MCPs  │  ×5 skills
──────────────────────────────────────────────────────
✔ read ×12  │  ✔ edit ×7  │  ✔ bash ×4
↻ bash: src/index.ts (3s)
```

Matrix katakana rain on the left. No Nerd Font needed.

## Install

```bash
cd ~/Desktop/pi-shannon-statusline
pi install .
```

## Features

- **Project line** — cwd, git branch/dirty, ahead/behind, file changes
- **Model line** — provider/model, context bar, token counts (input/output/cache)
- **Config line** — AGENTS.md count, rules count, MCP count, skills count
- **Tool activity** — completed tool counts, running tools with elapsed time
- **Matrix rain** — animated katakana rain on the left margin

## Pi-specific advantages vs Claude Code version

- **Live data** — reads Pi's context API directly, no stdin parsing
- **Widget placement** — rendered above the editor, not appended after response
- **Session-aware** — resets on /new, /resume, /fork
- **Model changes** — updates instantly on model switch

## License

MIT — based on shannon-statusline (MIT)
