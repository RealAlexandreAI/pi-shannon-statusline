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
⌘ ~/D/project  │  ⎇ main* ↑2 !3 +1  │  ↺ loop ×12  │  ctx 36k  │  ✦ 12m
λ deepseek / deepseek-v4-pro  │  ⊡ ████████░░░░ 65% (200k)  │  ⚡ TTFT 1.24s · ↓ ~42.1 tok/s · ~312 tok
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

Optional. Defaults work with zero config. Customize the matrix rain and Pi footer via `~/.pi/agent/shannon-statusline.json`:

```json
{
  "rain": false,
  "rainChars": "0123456789λΨΩΔΦABCDEFGH",
  "footer": false
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `rain` | boolean | `true` | Enable the left-side matrix rain column |
| `rainChars` | string | katakana + digits + greek | Character set picked at random for the rain |
| `footer` | boolean | `true` | Show Pi's footer; `false` hides the built-in footer and all extension status rows |

> **Font note:** the default rain uses half-width katakana (`ｦｧｨｩ…`) which require a CJK-capable font. If you see tofu boxes (乱码), either install a CJK font (e.g. [Sarasa Mono](https://github.com/be5invis/Sarasa-Gothic)), set `rainChars` to characters your font supports, or set `"rain": false`.

Set `"footer": false` to hide the entire Pi footer, including the built-in directory/token/model rows and statuses contributed through `ctx.ui.setStatus()`. The Shannon HUD below the editor is unaffected. Set it back to `true` to restore Pi's built-in footer.

Config is re-read on every HUD refresh, so changes take effect on the next refresh — no `/reload` needed.

## Features

| Section | Content |
|---|---|
| **Project + Git** | CWD (fish-style abbreviation), branch, dirty, ahead/behind, file changes |
| **Turn count** | `↺ loop ×N` between git and duration |
| **Model + Context + Throughput** | Provider / model name, context bar, current context tokens, TTFT, and decode rate |
| **Config counts** | AGENTS.md ×N, rules ×N, MCPs ×N, skills ×N |
| **Tool activity** | Completed tool counts, running tools with elapsed time |
| **Agent activity** | Running agent timer, completed agent count |
| **Waiting for user** | `⧗ waiting for user (select) "…"` while a blocking extension UI prompt is open (pi ≥ 0.84.4) |
| **Matrix rain** | 6-column animated katakana rain (configurable) |
| **Footer control** | Optional switch for Pi's built-in footer and extension status rows |

## Pi-native advantages

- **Live context API** — reads `getContextUsage()` directly, no stdin parsing
- **Widget rendering** — uses `ctx.ui.setWidget()` below the editor
- **Session-aware** — resets on `/new`, `/resume`, `/fork`
- **Model auto-detection** — updates on `model_select` event
- **Tool/agent tracking** — hooks `tool_call`, `tool_result`, `agent_start`, `agent_end`
- **Waiting-on-user detection** — hooks `ui_prompt_start` / `ui_prompt_end` (requires Pi ≥ 0.84.4; silently inactive on older versions)
- **Live throughput** — renders client-side TTFT and decode rate in the second HUD line, using final provider usage when available
- **Zero config by default** - install and go, optional JSON for rain and footer visibility

### Throughput semantics

`TTFT` is measured from Pi's `before_provider_request` hook to the first assistant delta. The live decode rate uses a `characters / 4` estimate, so it is approximate and varies by prose, code, JSON, and CJK. After the response ends, the HUD uses `message_end` usage for the output-token count and the client-observed first-to-last delta interval.

`Input/TTFT` is a client-side prompt-rate estimate. It includes request and network overhead and is not server-side prefill throughput. Providers that buffer output or do not report final usage can only show the approximate fallback.

## Testing

```bash
node --test src/__tests__/*.ts
```

## License

MIT — based on [shannon-statusline](https://github.com/RealAlexandreAI/shannon-statusline) (MIT)
