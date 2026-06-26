# pi-shannon-statusline

Cyberpunk terminal HUD for [Pi](https://github.com/earendil-works/pi-coding-agent) — ported from [shannon-statusline](https://github.com/RealAlexandreAI/shannon-statusline) (Claude Code).

```
⌘ ~/D/project  │  ⎇ main* ↑2 !3 +1  │  ✦ 12m
↑ deepseek/deepseek-v4-pro ★med  │  ⊡ ████████░░░░ 65% (200k)  │  ↑ 36k
※ ×3 AGENTS.md  │  ⊕ ×4 MCPs  │  ×5 skills
──────────────────────────────────────────────────────
✔ read ×12  │  ✔ edit ×7  │  ✔ bash ×4
↻ bash: src/index.ts (3s)
```

Matrix katakana rain on the left (configurable). Three styles. No Nerd Font needed.

## Install

```bash
cd ~/Desktop/pi-shannon-statusline
pi install .
```

## Commands

```
/shannon-statusline style cyberpunk   # Monokai Pro palette, matrix rain
/shannon-statusline style powerline   # Bright separator bars, muted accents
/shannon-statusline style minimal     # Reduced output, no tool breakdown
/shannon-statusline rain on           # Enable matrix rain
/shannon-statusline rain off          # Disable matrix rain
/shannon-statusline                   # Toggle rain
```

Config saved to `~/.pi/shannon-statusline.json`.

## Features

- **Project line** — cwd, git branch/dirty, ahead/behind, file changes
- **Model line** — provider/model (two-level), thinking level, context bar, token count
- **Config line** — AGENTS.md count, rules count, MCP count, skills count
- **Tool activity** — completed tool counts, running tools with elapsed time
- **Matrix rain** — animated katakana rain (toggleable)
- **3 visual styles** — cyberpunk, powerline, minimal

## Pi-specific advantages

- **Live data** — reads Pi's context API directly, no stdin parsing
- **Widget placement** — rendered above the editor via `setWidget()`
- **Session-aware** — resets on /new, /resume, /fork
- **Model + thinking level** — updates instantly on model or thinking level switch
- **Pi-native commands** — `/shannon-statusline` for style switching

## License

MIT — based on shannon-statusline (MIT)
